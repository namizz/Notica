import { io, Socket } from 'socket.io-client';
import { randomUUID } from 'crypto';
import { signatureHeader } from '../src/common/hmac.util';
import { WireMessage } from '../src/sms/sms-wire';

interface PairResponse {
  deviceId: string;
  projectId: string;
  name: string;
  deviceToken: string;
  signingSecret: string;
  server: string;
  socketUrl: string;
  heartbeatSeconds: number;
  pullIntervalMinutes: number;
}

interface CommandLineArgs {
  server: string;
  code: string;
  fail: boolean;
  drop: boolean;
  offline: boolean;
}

function parseArgs(): CommandLineArgs {
  const args = process.argv.slice(2);
  let server = 'http://localhost:8000';
  let code = '';
  let fail = false;
  let drop = false;
  let offline = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--server' && i + 1 < args.length) {
      server = args[++i];
    } else if (arg === '--code' && i + 1 < args.length) {
      code = args[++i];
    } else if (arg === '--fail') {
      fail = true;
    } else if (arg === '--drop') {
      drop = true;
    } else if (arg === '--offline') {
      offline = true;
    }
  }

  if (!code) {
    console.error('Error: --code <PAIRING_CODE> is required.');
    console.error('Example: npx ts-node scripts/fake-gateway.ts --server http://localhost:8000 --code K7PQ-2XMD');
    process.exit(1);
  }

  return { server: server.replace(/\/$/, ''), code, fail, drop, offline };
}

async function pair(server: string, code: string): Promise<PairResponse> {
  console.log(`[Fake Gateway] Pairing with server ${server} using code ${code}...`);
  const res = await fetch(`${server}/gateway/v1/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      device: {
        model: 'Fake Gateway CLI',
        androidSdk: 35,
        appVersion: '1.0.0-test',
        sims: [{ slot: 0, subscriptionId: 1, carrier: 'TestCarrier' }],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pairing failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as PairResponse;
  console.log(`[Fake Gateway] Paired successfully as device: ${data.deviceId} (${data.name})`);
  return data;
}

async function sendEvents(
  server: string,
  token: string,
  secret: string,
  events: Array<{
    eventId: string;
    type: string;
    messageId: string;
    occurredAt: string;
    data?: Record<string, unknown>;
  }>,
) {
  const bodyStr = JSON.stringify({ events });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = signatureHeader(secret, ts, bodyStr);

  const res = await fetch(`${server}/gateway/v1/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Notica-Timestamp': ts,
      'X-Notica-Signature': sig,
      'X-Notica-Gateway-Version': '1.0.0',
      'Content-Type': 'application/json',
    },
    body: bodyStr,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[Fake Gateway] Failed to post events (${res.status}): ${text}`);
  } else {
    const json = await res.json();
    console.log(`[Fake Gateway] Reported ${events.length} event(s):`, json);
  }
}

async function main() {
  const { server, code, fail, drop, offline } = parseArgs();
  const credentials = await pair(server, code);

  if (offline) {
    console.log('[Fake Gateway] --offline flag set; exiting immediately.');
    process.exit(0);
  }

  console.log(`[Fake Gateway] Connecting socket to ${credentials.socketUrl}...`);
  const socket: Socket = io(credentials.socketUrl, {
    auth: { token: credentials.deviceToken },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log('[Fake Gateway] Socket connected! Listening for sms:send...');
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Fake Gateway] Socket disconnected: ${reason}`);
  });

  socket.on('gateway:revoked', () => {
    console.log('[Fake Gateway] Gateway revoked by server! Exiting.');
    process.exit(0);
  });

  // Periodic heartbeat
  setInterval(() => {
    if (socket.connected) {
      socket.emit('gateway:heartbeat', {
        battery: 99,
        charging: true,
        network: 'wifi',
        signalLevel: 4,
        outboxDepth: 0,
        pendingEvents: 0,
      });
      console.log('[Fake Gateway] Emitted gateway:heartbeat');
    }
  }, credentials.heartbeatSeconds * 1000);

  // Handle incoming SMS push
  socket.on('sms:send', async (data: { messages: WireMessage[] }) => {
    console.log(`[Fake Gateway] Received sms:send batch with ${data.messages?.length || 0} message(s)`);
    if (drop) {
      console.log('[Fake Gateway] --drop flag set; ignoring message batch to test lease expiration.');
      return;
    }

    for (const msg of data.messages) {
      console.log(`[Fake Gateway] Processing message: ${msg.messageId} to: ${msg.to} (parts: ${msg.parts})`);

      if (fail) {
        // Step 1: accepted
        await sendEvents(server, credentials.deviceToken, credentials.signingSecret, [
          {
            eventId: randomUUID(),
            type: 'sms:accepted',
            messageId: msg.messageId,
            occurredAt: new Date().toISOString(),
          },
        ]);

        // Step 2: failed
        setTimeout(async () => {
          await sendEvents(server, credentials.deviceToken, credentials.signingSecret, [
            {
              eventId: randomUUID(),
              type: 'sms:failed',
              messageId: msg.messageId,
              occurredAt: new Date().toISOString(),
              data: {
                stage: 'send',
                errorCode: 'GENERIC_FAILURE',
                errorMessage: 'Simulated failure from fake gateway',
              },
            },
          ]);
        }, 1000);
      } else {
        // Step 1: accepted
        await sendEvents(server, credentials.deviceToken, credentials.signingSecret, [
          {
            eventId: randomUUID(),
            type: 'sms:accepted',
            messageId: msg.messageId,
            occurredAt: new Date().toISOString(),
          },
        ]);

        // Step 2: sent after 1s
        setTimeout(async () => {
          await sendEvents(server, credentials.deviceToken, credentials.signingSecret, [
            {
              eventId: randomUUID(),
              type: 'sms:sent',
              messageId: msg.messageId,
              occurredAt: new Date().toISOString(),
              data: { partsSent: msg.parts, simSlot: msg.simSlot ?? 0 },
            },
          ]);

          // Step 3: delivered after 2s
          setTimeout(async () => {
            await sendEvents(server, credentials.deviceToken, credentials.signingSecret, [
              {
                eventId: randomUUID(),
                type: 'sms:delivered',
                messageId: msg.messageId,
                occurredAt: new Date().toISOString(),
                data: { tpStatus: 0 },
              },
            ]);
          }, 2000);
        }, 1000);
      }
    }
  });
}

main().catch((err) => {
  console.error('[Fake Gateway] Fatal error:', err);
  process.exit(1);
});
