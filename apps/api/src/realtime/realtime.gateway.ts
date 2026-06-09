import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    const apiKey = client.handshake.query.apiKey as string;
    const recipientId = client.handshake.query.recipientId as string;

    this.logger.log(`Connection attempt on namespace /realtime with apiKey: ${apiKey}, recipientId: ${recipientId}`);

    if (!apiKey || !recipientId) {
      this.logger.warn(`Connection rejected: missing apiKey or recipientId`);
      client.disconnect(true);
      return;
    }

    try {
      // 1. Verify project / API key
      const project = await this.prisma.project.findUnique({
        where: { apiKey },
      });

      if (!project) {
        this.logger.warn(`Connection rejected: invalid API key`);
        client.disconnect(true);
        return;
      }

      const tenantId = project.tenantId;

      // Handle developer dashboard connections
      if (recipientId === 'dashboard') {
        const roomName = `${tenantId}:logs`;
        await client.join(roomName);
        this.logger.log(`Developer Dashboard client ${client.id} joined logs room ${roomName}`);
        client.data = { tenantId, recipientId, projectId: project.id, isDashboard: true };
        return;
      }

      // 2. Look up or create recipient user under this tenant
      let recipientUser = await this.prisma.recipientUser.findUnique({
        where: {
          tenantId_externalUserId: {
            tenantId,
            externalUserId: recipientId,
          },
        },
      });

      if (!recipientUser) {
        // Auto-create recipient user on connection if they don't exist yet
        recipientUser = await this.prisma.recipientUser.create({
          data: {
            tenantId,
            externalUserId: recipientId,
            name: `Recipient ${recipientId}`,
          },
        });
        this.logger.log(`Auto-created recipient user: ${recipientId} for tenant ${tenantId}`);
      }

      // 3. Join room scoped to tenant and recipient
      const roomName = `${tenantId}:${recipientId}`;
      await client.join(roomName);
      this.logger.log(`Client ${client.id} authenticated and joined room ${roomName}`);

      // Save metadata in socket instance for convenience
      client.data = { tenantId, recipientId, projectId: project.id, isDashboard: false };

    } catch (e: any) {
      this.logger.error(`Error during connection validation: ${e.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Helper method to emit notifications to a specific recipient room
  sendNotificationToRoom(tenantId: string, recipientId: string, payload: any) {
    const roomName = `${tenantId}:${recipientId}`;
    this.server.to(roomName).emit('notification', payload);
    this.logger.log(`Realtime notification emitted to room ${roomName}`);
  }

  // Helper method to emit activity logs to the developer dashboard logs room
  sendLogToProject(tenantId: string, log: any) {
    const roomName = `${tenantId}:logs`;
    this.server.to(roomName).emit('log_event', log);
    this.logger.log(`Realtime activity log emitted to room ${roomName}`);
  }
}
