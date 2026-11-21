import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';
import { WEBHOOK_EVENT_TYPES } from './webhook-events';
import { WebhooksService } from './webhooks.service';

@ApiTags('Webhooks')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get('event-types')
  @ApiOperation({ summary: 'List the event types an endpoint can subscribe to' })
  eventTypes() {
    return { enabled: this.webhooks.isEnabled(), events: WEBHOOK_EVENT_TYPES };
  }

  @Post()
  @ApiOperation({ summary: 'Register a webhook endpoint; returns its signing secret' })
  create(
    @CurrentTenant() tenantId: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreateWebhookDto,
  ) {
    return this.webhooks.create(tenantId, projectId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List webhook endpoints' })
  list(@CurrentTenant() tenantId: string, @Param('projectId') projectId: string) {
    return this.webhooks.list(tenantId, projectId);
  }

  @Get(':id/secret')
  @ApiOperation({ summary: 'Reveal the signing secret of an endpoint' })
  secret(
    @CurrentTenant() tenantId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.webhooks.revealSecret(tenantId, projectId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an endpoint (url, events, enabled)' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.webhooks.update(tenantId, projectId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an endpoint' })
  remove(
    @CurrentTenant() tenantId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.webhooks.remove(tenantId, projectId, id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Send a webhook.test event to the endpoint' })
  test(
    @CurrentTenant() tenantId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.webhooks.sendTest(tenantId, projectId, id);
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'The 50 most recent deliveries to the endpoint' })
  deliveries(
    @CurrentTenant() tenantId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.webhooks.deliveries(tenantId, projectId, id);
  }
}
