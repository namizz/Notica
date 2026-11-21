import { Injectable, Logger } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import { SmsOutboxService, toWireMessage } from '../sms-outbox.service';
import { deviceRoom, SOCKET_EVENTS, WireMessage } from '../sms-wire';
import { GatewayPresenceService } from './gateway-presence.service';

export const DISPATCH_BATCH_SIZE = 50;

/**
 * Pushes queued SMS to a connected phone. Leasing happens in the database, so
 * calling dispatch from several places (new message, phone reconnect, phone
 * accepted a batch, maintenance tick) never sends a message twice.
 */
@Injectable()
export class GatewayDispatcher {
  private readonly logger = new Logger(GatewayDispatcher.name);
  private namespace: Pick<Namespace, 'to' | 'in'> | null = null;

  constructor(
    private readonly outbox: SmsOutboxService,
    private readonly presence: GatewayPresenceService,
  ) {}

  /** Called by the socket gateway once its namespace exists. */
  attach(namespace: Pick<Namespace, 'to' | 'in'>) {
    this.namespace = namespace;
  }

  /** Leases the next batch for a device and pushes it. Returns the count. */
  async dispatch(deviceId: string): Promise<number> {
    if (!this.namespace || !(await this.presence.isOnline(deviceId))) {
      return 0;
    }
    const leased = await this.outbox.lease(deviceId, DISPATCH_BATCH_SIZE);
    if (leased.length > 0) {
      this.push(deviceId, leased.map(toWireMessage));
      this.logger.log(`Pushed ${leased.length} SMS to gateway ${deviceId}`);
    }
    return leased.length;
  }

  /** Fire-and-forget variant for callers that must not fail on a push. */
  dispatchSoon(deviceId: string) {
    this.dispatch(deviceId).catch((error: unknown) =>
      this.logger.warn(`Dispatch to ${deviceId} failed: ${String(error)}`),
    );
  }

  push(deviceId: string, messages: WireMessage[]) {
    this.namespace?.to(deviceRoom(deviceId)).emit(SOCKET_EVENTS.send, {
      messages,
    });
  }

  /** Tells a revoked phone to forget its credentials, then disconnects it. */
  revoke(deviceId: string) {
    if (!this.namespace) {
      return;
    }
    this.namespace.to(deviceRoom(deviceId)).emit(SOCKET_EVENTS.revoked, {});
    this.disconnect(deviceId);
  }

  /** Drops sockets that still use a replaced token, without revoking. */
  disconnect(deviceId: string) {
    this.namespace?.in(deviceRoom(deviceId)).disconnectSockets(true);
  }
}
