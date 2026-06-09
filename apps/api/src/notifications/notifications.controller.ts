import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';

@ApiTags('Notifications')
@UseGuards(ThrottlerGuard, AuthGuard(['jwt', 'api-key']))
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @ApiOperation({ summary: 'Trigger a notification to a recipient user' })
  @ApiHeader({ name: 'x-api-key', description: 'API Key for project authorization (if not using JWT)', required: false })
  @ApiResponse({ status: 201, description: 'Notification queued successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  create(
    @Req() req: any,
    @CurrentTenant() tenantId: string,
    @Body() dto: SendNotificationDto,
  ) {
    const projectId = req.user?.projectId || '';
    return this.notificationsService.sendNotification(tenantId, projectId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all notification history for the active tenant' })
  @ApiResponse({ status: 200, description: 'List of all tenant notifications returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  getAllNotifications(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('channel') channel?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '50', 10);
    return this.notificationsService.getTenantNotifications(
      tenantId,
      pageNum,
      limitNum,
      channel,
      status,
      search,
    );
  }

  @Get('recipient/:externalUserId')
  @ApiOperation({ summary: 'Get notification history for a specific recipient user' })
  @ApiResponse({ status: 200, description: 'List of notifications returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  getHistory(
    @CurrentTenant() tenantId: string,
    @Param('externalUserId') externalUserId: string,
  ) {
    return this.notificationsService.getRecipientNotifications(tenantId, externalUserId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a specific notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read successfully.' })
  @ApiResponse({ status: 404, description: 'Notification not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  markAsRead(
    @CurrentTenant() tenantId: string,
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.markAsRead(tenantId, notificationId);
  }
}
