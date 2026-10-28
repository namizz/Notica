import { RealtimeGateway } from './realtime.gateway';

/**
 * Fake Socket.IO server whose `fetchSockets()` answers from a room registry.
 * With the Redis adapter installed that call is cluster-wide, so a room entry
 * here stands for a socket held by any instance, not only this one.
 */
function fakeServer(rooms: Record<string, number>) {
  const emits: { room: string; event: string; payload: unknown }[] = [];

  const target = (room: string) => ({
    emit: (event: string, payload: unknown) => {
      emits.push({ room, event, payload });
      return true;
    },
    fetchSockets: () =>
      Promise.resolve(
        Array.from({ length: rooms[room] ?? 0 }, (_unused, index) => ({
          id: `${room}#${index}`,
        })),
      ),
  });

  return {
    emits,
    server: {
      in: target,
      to: target,
    },
  };
}

function buildGateway(rooms: Record<string, number>) {
  const gateway = new RealtimeGateway({} as never, {} as never);
  const { server, emits } = fakeServer(rooms);
  gateway.server = server as never;
  return { gateway, emits };
}

const TENANT = 'tenant-1';
const PROJECT = 'project-1';
const RECIPIENT = 'user-8472';
const ROOM = `${TENANT}:${PROJECT}:recipient:${RECIPIENT}`;

describe('RealtimeGateway room delivery', () => {
  const payload = {
    id: 'notification-1',
    title: 'Payment received',
    body: 'Your order is confirmed',
    channel: 'IN_APP',
    createdAt: new Date('2026-10-28T00:00:00.000Z'),
  };

  it('emits to the recipient room scoped by tenant and project', async () => {
    const { gateway, emits } = buildGateway({ [ROOM]: 1 });

    await gateway.sendNotificationToRoom(TENANT, PROJECT, RECIPIENT, payload);

    expect(emits).toEqual([{ room: ROOM, event: 'notification', payload }]);
  });

  it('counts a recipient socket that another instance holds', async () => {
    // The regression this guards: before the Redis adapter, fetchSockets() was
    // process-local, so a socket on another instance counted as zero and the
    // delivery was recorded SKIPPED even though the recipient was connected.
    const { gateway } = buildGateway({ [ROOM]: 2 });

    await expect(
      gateway.sendNotificationToRoom(TENANT, PROJECT, RECIPIENT, payload),
    ).resolves.toBe(2);
  });

  it('reports zero only when the room is genuinely empty', async () => {
    const { gateway } = buildGateway({});

    await expect(
      gateway.sendNotificationToRoom(TENANT, PROJECT, RECIPIENT, payload),
    ).resolves.toBe(0);
  });

  it('keeps recipient rooms isolated across projects', async () => {
    const otherProjectRoom = `${TENANT}:project-2:recipient:${RECIPIENT}`;
    const { gateway } = buildGateway({ [otherProjectRoom]: 3 });

    // Same external user id, different project: must not resolve to the
    // other project's room.
    await expect(
      gateway.sendNotificationToRoom(TENANT, PROJECT, RECIPIENT, payload),
    ).resolves.toBe(0);
  });

  it('emits dashboard activity to the project log room', () => {
    const logRoom = `${TENANT}:${PROJECT}:logs`;
    const { gateway, emits } = buildGateway({ [logRoom]: 1 });
    const log = {
      timestamp: new Date('2026-10-28T00:00:00.000Z'),
      type: 'success' as const,
      message: 'In-app notification emitted to 1 connected client(s)',
    };

    gateway.sendLogToProject(TENANT, PROJECT, log);

    expect(emits).toEqual([
      { room: logRoom, event: 'log_event', payload: log },
    ]);
  });
});
