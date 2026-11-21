import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { SmsStatus } from '@prisma/client';
import { Queue, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { smsProviderName, smsSettings } from '../config/environment';
import { SmsOutboxService } from './sms-outbox.service';
import { GatewayDispatcher } from './gateway/gateway-dispatcher.service';
import { GatewayPresenceService } from './gateway/gateway-presence.service';
import { GatewayRouter } from './gateway/gateway-router.service';

@Injectable()
@Processor('sms-maintenance')
export class SmsMaintenanceProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(SmsMaintenanceProcessor.name);

  constructor(
    @InjectQueue('sms-maintenance') private readonly maintenanceQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly outbox: SmsOutboxService,
    private readonly dispatcher: GatewayDispatcher,
    private readonly presence: GatewayPresenceService,
    private readonly router: GatewayRouter,
  ) {
    super();
  }

  async onModuleInit() {
    if (smsProviderName() !== 'gateway') {
      return;
    }
    // Register the two recurring schedulers.
    await this.maintenanceQueue.upsertJobScheduler(
      'sms-maintenance-tick',
      { every: 30_000 },
      { name: 'tick' },
    );
    await this.maintenanceQueue.upsertJobScheduler(
      'sms-maintenance-retention',
      { every: 3_600_000 },
      { name: 'retention' },
    );
    this.logger.log('SMS maintenance schedulers registered (tick=30s, retention=1h)');
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'tick':
        await this.runTick();
        break;
      case 'retention':
        await this.runRetention();
        break;
      default:
        this.logger.warn(`Unknown sms-maintenance job: ${job.name}`);
    }
  }

  private async runTick() {
    const settings = smsSettings();
    const now = new Date();

    // (a) DISPATCHED messages whose lease has expired.
    const expiredLeases = await this.prisma.smsMessage.findMany({
      where: { status: SmsStatus.DISPATCHED, leaseUntil: { lt: now } },
      select: { id: true, dispatchAttempts: true },
    });
    for (const msg of expiredLeases) {
      if (msg.dispatchAttempts >= settings.maxDispatchAttempts) {
        await this.outbox.transition(msg.id, { kind: 'failed', code: 'GATEWAY_UNREACHABLE', at: now });
      } else {
        await this.prisma.smsMessage.updateMany({
          where: { id: msg.id, status: SmsStatus.DISPATCHED },
          data: { status: SmsStatus.QUEUED, leaseUntil: null },
        });
      }
    }

    // (b) QUEUED or DISPATCHED messages whose TTL has passed.
    const ttlExpired = await this.prisma.smsMessage.findMany({
      where: {
        status: { in: [SmsStatus.QUEUED, SmsStatus.DISPATCHED] },
        expiresAt: { lt: now },
      },
      select: { id: true },
    });
    for (const msg of ttlExpired) {
      await this.outbox.transition(msg.id, { kind: 'failed', code: 'EXPIRED', at: now });
    }

    // (c) QUEUED messages on a device that is offline — reassign.
    const reassignCutoff = new Date(now.getTime() - settings.reassignAfterSeconds * 1000);
    const stuckMessages = await this.prisma.smsMessage.findMany({
      where: {
        status: SmsStatus.QUEUED,
        gatewayDeviceId: { not: null },
      },
      select: { id: true, projectId: true, tenantId: true, gatewayDeviceId: true, deliveryId: true },
    });
    for (const msg of stuckMessages) {
      if (!msg.gatewayDeviceId) continue;
      const isOnline = await this.presence.isOnline(msg.gatewayDeviceId);
      if (isOnline) continue;
      const device = await this.prisma.gatewayDevice.findUnique({
        where: { id: msg.gatewayDeviceId },
        select: { lastSeenAt: true, revokedAt: true, enabled: true },
      });
      const deviceUnavailable =
        !device ||
        device.revokedAt !== null ||
        !device.enabled ||
        (device.lastSeenAt !== null && device.lastSeenAt < reassignCutoff);
      if (!deviceUnavailable) continue;

      // Try to reassign to another online device.
      const newDevice = await this.router.pick(msg.projectId, {
        onlineOnly: true,
        excludeId: msg.gatewayDeviceId,
      });
      if (newDevice) {
        const updated = await this.prisma.smsMessage.updateMany({
          where: { id: msg.id, status: SmsStatus.QUEUED },
          data: { gatewayDeviceId: newDevice.id },
        });
        if (updated.count > 0) {
          await this.prisma.notificationDelivery
            .update({
              where: { id: msg.deliveryId },
              data: { provider: `sms-gateway:${newDevice.id}` },
            })
            .catch((err) => {
              this.logger.warn(
                `Failed to update delivery provider for SMS ${msg.id}: ${err}`,
              );
            });
          this.logger.log(
            `SMS ${msg.id.slice(0, 8)} reassigned from ${msg.gatewayDeviceId.slice(0, 8)} to ${newDevice.id.slice(0, 8)}`,
          );
        }
      }
    }

    // (d) Dispatch all QUEUED messages to their online devices.
    const queuedDevices = await this.prisma.smsMessage.findMany({
      where: { status: SmsStatus.QUEUED, gatewayDeviceId: { not: null } },
      select: { gatewayDeviceId: true },
      distinct: ['gatewayDeviceId'],
    });
    for (const { gatewayDeviceId } of queuedDevices) {
      if (!gatewayDeviceId) continue;
      const isOnline = await this.presence.isOnline(gatewayDeviceId);
      if (isOnline) {
        await this.dispatcher.dispatch(gatewayDeviceId).catch((err: unknown) => {
          this.logger.warn(
            `Failed to dispatch to device ${gatewayDeviceId.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
    }
  }

  private async runRetention() {
    const settings = smsSettings();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const textCutoff = new Date(
      Date.now() - settings.textRetentionDays * 24 * 60 * 60 * 1000,
    );

    const [deletedEvents, updatedTexts] = await Promise.all([
      this.prisma.gatewayEvent.deleteMany({
        where: { receivedAt: { lt: thirtyDaysAgo } },
      }),
      this.prisma.smsMessage.updateMany({
        where: { text: { not: null }, createdAt: { lt: textCutoff } },
        data: { text: null },
      }),
    ]);

    this.logger.log(
      `Retention: deleted ${deletedEvents.count} gateway events, cleared text from ${updatedTexts.count} SMS messages`,
    );
  }
}
