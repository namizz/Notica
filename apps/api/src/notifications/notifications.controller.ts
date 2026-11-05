import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  Query,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import type { Request, Response } from 'express';

interface NotificationRequest extends Request {
  user: {
    tenantId: string;
    projectId?: string;
  };
}

const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

@ApiTags('Notifications')
@UseGuards(ThrottlerGuard, AuthGuard(['jwt', 'api-key']))
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  private resolveProjectId(
    request: NotificationRequest,
    requestedProjectId?: string,
  ): string {
    const authenticatedProjectId = request.user.projectId;

    if (
      authenticatedProjectId &&
      requestedProjectId &&
      authenticatedProjectId !== requestedProjectId
    ) {
      throw new BadRequestException(
        'The requested project does not match the authenticated API key',
      );
    }

    const projectId = authenticatedProjectId ?? requestedProjectId;
    if (!projectId) {
      throw new BadRequestException('projectId is required');
    }

    return projectId;
  }

  private resolveIdempotencyKey(header: string | undefined) {
    if (header === undefined) {
      return undefined;
    }

    const key = header.trim();
    if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key must be 1-${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
      );
    }

    return key;
  }

  @Post()
  @ApiOperation({ summary: 'Trigger a notification to a recipient user' })
  @ApiHeader({
    name: 'x-api-key',
    description: 'API Key for project authorization (if not using JWT)',
    required: false,
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description:
      'Unique value (e.g. a UUID) per notification. Retrying with the same key returns the original notification instead of sending it again. Keys are scoped to the project and never expire.',
    required: false,
  })
  @ApiResponse({
    status: 201,
    description:
      'Notification queued successfully. A retry with an already used Idempotency-Key returns the original notification with the Idempotent-Replayed: true header.',
  })
  @ApiResponse({ status: 400, description: 'Invalid Idempotency-Key.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 422,
    description:
      'Idempotency-Key was already used with a different recipient, title, body, or channel.',
  })
  async create(
    @Req() request: NotificationRequest,
    @Res({ passthrough: true }) response: Response,
    @CurrentTenant() tenantId: string,
    @Query('projectId') requestedProjectId: string | undefined,
    @Headers('idempotency-key') idempotencyKeyHeader: string | undefined,
    @Body() dto: SendNotificationDto,
  ) {
    const projectId = this.resolveProjectId(request, requestedProjectId);
    const idempotencyKey = this.resolveIdempotencyKey(idempotencyKeyHeader);
    const { notification, replayed } =
      await this.notificationsService.sendNotification(
        tenantId,
        projectId,
        dto,
        idempotencyKey,
      );

    if (replayed) {
      response.setHeader('Idempotent-Replayed', 'true');
    }
    return notification;
  }

  @Get()
  @ApiOperation({
    summary: 'Get all notification history for the active tenant',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all tenant notifications returned successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  getAllNotifications(
    @Req() request: NotificationRequest,
    @CurrentTenant() tenantId: string,
    @Query() query: ListNotificationsDto,
  ) {
    const projectId = this.resolveProjectId(request, query.projectId);
    return this.notificationsService.getTenantNotifications(
      tenantId,
      projectId,
      query,
    );
  }

  @Get('recipient/:externalUserId')
  @ApiOperation({
    summary: 'Get notification history for a specific recipient user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of notifications returned successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  getHistory(
    @Req() request: NotificationRequest,
    @CurrentTenant() tenantId: string,
    @Query('projectId') requestedProjectId: string | undefined,
    @Param('externalUserId') externalUserId: string,
  ) {
    const projectId = this.resolveProjectId(request, requestedProjectId);
    return this.notificationsService.getRecipientNotifications(
      tenantId,
      projectId,
      externalUserId,
    );
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a specific notification as read' })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read successfully.',
  })
  @ApiResponse({ status: 404, description: 'Notification not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  markAsRead(
    @Req() request: NotificationRequest,
    @CurrentTenant() tenantId: string,
    @Query('projectId') requestedProjectId: string | undefined,
    @Param('id') notificationId: string,
  ) {
    const projectId = this.resolveProjectId(request, requestedProjectId);
    return this.notificationsService.markAsRead(
      tenantId,
      projectId,
      notificationId,
    );
  }
}
