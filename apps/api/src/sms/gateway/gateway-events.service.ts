import { Injectable, Logger } from '@nestjs/common';
import { GatewayDevice, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsOutboxService, SmsTransition } from '../sms-outbox.service';
import { DeviceEvent, EventsResult } from '../sms-wire';
import { GatewayDispatcher } from './gateway-dispatcher.service';

function toTransition(event: DeviceEvent): SmsTransition {
  const parsed = new Date(event.occurredAt);
  // A phone with a wrong clock must not write future or ancient times.
  const now = Date.now();
  const at =
    Number.isNaN(parsed.getTime()) ||
    parsed.getTime() > now + 5 * 60_000 ||
    parsed.getTime() < now - 7 * 86_400_000
      ? new Date(now)
      : parsed;

  switch (event.type) {
    case 'sms:accepted':
      return { kind: 'accepted', at };
    case 'sms:sent':
      return { kind: 'sent', at };
    case 'sms:delivered':
      return { kind: 'delivered', at };
    case 'sms:failed':
      return {
        kind: 'failed',
        at,
        code: event.data?.errorCode ?? 'GENERIC_FAILURE',
        message: event.data?.errorMessage,
      };
  }
}

/**
 * Applies status webhooks from a gateway phone. Each event is recorded by its
 * eventId first, so a retried webhook is acknowledged without being applied
 * twice. An event whose processing fails is left out of both lists, so the
 * phone sends it again.
 */
@Injectable()
export class GatewayEventsService {
  private readonly logger = new Logger(GatewayEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: SmsOutboxService,
    private readonly dispatcher: GatewayDispatcher,
  ) {}

  async ingest(device: GatewayDevice, events: DeviceEvent[]): Promise<EventsResult> {
    const result: EventsResult = { accepted: [], rejected: [] };
    let freedCapacity = false;

    for (const event of events) {
      try {
        await this.prisma.gatewayEvent.create({
          data: {
            id: event.eventId,
            deviceId: device.id,
            messageId: event.messageId,
            type: event.type,
            occurredAt: new Date(event.occurredAt),
          },
        });
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          result.accepted.push(event.eventId);
          continue;
        }
        this.logger.warn(`Could not record event ${event.eventId}: ${String(error)}`);
        continue;
      }

      try {
        const exists = await this.prisma.smsMessage.findFirst({
          where: { id: event.messageId, gatewayDeviceId: device.id },
          select: { id: true },
        });
        if (!exists) {
          result.rejected.push({ eventId: event.eventId, reason: 'unknown_message' });
          continue;
        }

        await this.outbox.transition(event.messageId, toTransition(event), {
          deviceId: device.id,
        });
        result.accepted.push(event.eventId);
        freedCapacity ||= event.type !== 'sms:sent';
      } catch (error: unknown) {
        // Forget the event so the phone's retry is processed, not skipped.
        await this.prisma.gatewayEvent
          .delete({ where: { id: event.eventId } })
          .catch(() => undefined);
        this.logger.error(`Event ${event.eventId} failed: ${String(error)}`);
      }
    }

    await this.prisma.gatewayDevice
      .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);

    // The phone took a batch; offer it the next one.
    if (freedCapacity) {
      this.dispatcher.dispatchSoon(device.id);
    }
    return result;
  }
}
