/**
 * Wire format between Notica and the Notica Gateway Android app (protocol v1).
 * See docs/sms-gateway.md. Keep in sync with
 * apps/android-gateway/app/src/main/java/com/notica/gateway/net/Dto.kt.
 */

export const GATEWAY_PROTOCOL_MAJOR = 1;

/** socket.io namespace the phones connect to. */
export const GATEWAY_NAMESPACE = '/gateway';

export const SOCKET_EVENTS = {
  send: 'sms:send',
  revoked: 'gateway:revoked',
  heartbeat: 'gateway:heartbeat',
  error: 'gateway:error',
} as const;

export const DEVICE_EVENT_TYPES = [
  'sms:accepted',
  'sms:sent',
  'sms:delivered',
  'sms:failed',
] as const;

export type DeviceEventType = (typeof DEVICE_EVENT_TYPES)[number];

export const SMS_ERROR_CODES = [
  'RADIO_OFF',
  'NO_SERVICE',
  'NULL_PDU',
  'GENERIC_FAILURE',
  'LIMIT_EXCEEDED',
  'NO_PERMISSION',
  'INVALID_NUMBER',
  'NO_SIM',
  'DELIVERY_REJECTED',
  'EXPIRED',
] as const;

/** Failures decided by the server; a later report from the phone overrides them. */
export const PROVISIONAL_FAILURE_CODES = ['GATEWAY_UNREACHABLE', 'EXPIRED'];

export interface WireMessage {
  messageId: string;
  to: string;
  text: string;
  simSlot: number | null;
  encoding: 'GSM7' | 'UCS2';
  parts: number;
  deliveryReport: boolean;
  expiresAt: string;
}

export interface DeviceEvent {
  eventId: string;
  type: DeviceEventType;
  messageId: string;
  occurredAt: string;
  data?: {
    partsSent?: number;
    simSlot?: number;
    tpStatus?: number;
    stage?: 'send' | 'delivery';
    errorCode?: string;
    errorMessage?: string;
  };
}

export interface EventsResult {
  accepted: string[];
  rejected: { eventId: string; reason: string }[];
}

export function deviceRoom(deviceId: string) {
  return `gw:device:${deviceId}`;
}
