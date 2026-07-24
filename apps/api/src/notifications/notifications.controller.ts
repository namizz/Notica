import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { Request } from 'express';

interface NotificationRequest extends Request {
  user: {
    tenantId: string;
    projectId?: string;
  };
}

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

  @Post()
  @ApiOperation({ summary: 'Trigger a notification to a recipient user' })
  @ApiHeader({
    name: 'x-api-key',
    description: 'API Key for project authorization (if not using JWT)',
    required: false,
  })
  @ApiResponse({
    status: 201,
    description: 'Notification queued successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  create(
    @Req() request: NotificationRequest,
    @CurrentTenant() tenantId: string,
    @Query('projectId') requestedProjectId: string | undefined,
    @Body() dto: SendNotificationDto,
  ) {
    const projectId = this.resolveProjectId(request, requestedProjectId);
    return this.notificationsService.sendNotification(tenantId, projectId, dto);
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
