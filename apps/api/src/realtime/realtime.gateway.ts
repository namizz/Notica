import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ClientTokenPayload } from '../auth/client-tokens.service';
import { PrismaService } from '../prisma/prisma.service';

interface DashboardTokenPayload {
  sub: string;
  sid: string;
}

export interface RealtimeNotificationPayload {
  id: string;
  title: string;
  body: string;
  channel: string;
  createdAt: Date;
}

export interface ActivityLogPayload {
  timestamp: Date;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  notificationId?: string;
  recipientId?: string;
  channel?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown realtime error';
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      if (client.handshake.query.recipientId === 'dashboard') {
        await this.authenticateDashboard(client);
      } else {
        await this.authenticateRecipient(client);
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Realtime connection ${client.id} rejected: ${errorMessage(error)}`,
      );
      client.disconnect(true);
    }
  }

  private getHandshakeToken(client: Socket): string {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token !== 'string' || !auth.token) {
      throw new Error('Missing realtime access token');
    }

    return auth.token;
  }

  private async authenticateRecipient(client: Socket) {
    const payload = await this.jwtService.verifyAsync<ClientTokenPayload>(
      this.getHandshakeToken(client),
      {
        secret:
          process.env.CLIENT_TOKEN_SECRET ||
          process.env.JWT_SECRET ||
          'super-secret-dev-client',
      },
    );

    if (
      payload.type !== 'recipient' ||
      !payload.tenantId ||
      !payload.projectId ||
      !payload.recipientId
    ) {
      throw new Error('Invalid recipient client token');
    }

    const recipient = await this.prisma.recipientUser.findFirst({
      where: {
        tenantId: payload.tenantId,
        projectId: payload.projectId,
        externalUserId: payload.recipientId,
      },
      select: { id: true },
    });

    if (!recipient) {
      throw new Error('Recipient does not belong to the token project');
    }

    const roomName = this.recipientRoom(
      payload.tenantId,
      payload.projectId,
      payload.recipientId,
    );
    await client.join(roomName);
    client.data = {
      ...payload,
      recipientDbId: recipient.id,
      isDashboard: false,
    };
    this.logger.log(`Recipient client ${client.id} joined room ${roomName}`);
  }

  private async authenticateDashboard(client: Socket) {
    const payload = await this.jwtService.verifyAsync<DashboardTokenPayload>(
      this.getHandshakeToken(client),
      {
        secret: process.env.JWT_SECRET || 'super-secret-dev',
      },
    );

    const requestedProjectId = client.handshake.query.projectId;
    if (typeof requestedProjectId !== 'string' || !requestedProjectId) {
      throw new Error('Dashboard projectId is required');
    }

    const session = await this.prisma.userSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!session) {
      throw new Error('Dashboard session is invalid or expired');
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: requestedProjectId,
        tenantId: session.user.tenantId,
      },
      select: { id: true },
    });

    if (!project) {
      throw new Error('Dashboard project access is invalid');
    }

    const roomName = this.logRoom(session.user.tenantId, project.id);
    await client.join(roomName);
    client.data = {
      tenantId: session.user.tenantId,
      projectId: project.id,
      userId: session.userId,
      isDashboard: true,
    };
    this.logger.log(`Dashboard client ${client.id} joined room ${roomName}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  async sendNotificationToRoom(
    tenantId: string,
    projectId: string,
    recipientId: string,
    payload: RealtimeNotificationPayload,
  ): Promise<number> {
    const roomName = this.recipientRoom(tenantId, projectId, recipientId);
    const sockets = await this.server.in(roomName).fetchSockets();
    this.server.to(roomName).emit('notification', payload);
    this.logger.log(
      `Realtime notification emitted to ${sockets.length} client(s) in ${roomName}`,
    );
    return sockets.length;
  }

  sendLogToProject(
    tenantId: string,
    projectId: string,
    log: ActivityLogPayload,
  ) {
    const roomName = this.logRoom(tenantId, projectId);
    this.server.to(roomName).emit('log_event', log);
  }

  private recipientRoom(
    tenantId: string,
    projectId: string,
    recipientId: string,
  ) {
    return `${tenantId}:${projectId}:recipient:${recipientId}`;
  }

  private logRoom(tenantId: string, projectId: string) {
    return `${tenantId}:${projectId}:logs`;
  }
}
