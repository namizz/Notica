import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { RecipientsService } from './recipients.service';
import { IdentifyRecipientDto } from './dto/identify-recipient.dto';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';

@ApiTags('Recipients')
@UseGuards(AuthGuard(['jwt', 'api-key']))
@Controller('recipients')
export class RecipientsController {
  constructor(private readonly recipientsService: RecipientsService) {}

  @Post('identify')
  @ApiOperation({ summary: 'Register or update a recipient user profile' })
  @ApiHeader({ name: 'x-api-key', description: 'API Key for project authorization (if not using JWT)', required: false })
  @ApiResponse({ status: 201, description: 'Recipient identified and synchronized successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  identify(
    @CurrentTenant() tenantId: string,
    @Body() dto: IdentifyRecipientDto,
  ) {
    return this.recipientsService.identifyRecipient(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all recipient users' })
  @ApiResponse({ status: 200, description: 'List of recipients returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.recipientsService.getRecipients(tenantId);
  }

  @Get(':externalUserId')
  @ApiOperation({ summary: 'Retrieve details of a specific recipient user' })
  @ApiResponse({ status: 200, description: 'Recipient user returned successfully.' })
  @ApiResponse({ status: 404, description: 'Recipient not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  findOne(
    @CurrentTenant() tenantId: string,
    @Param('externalUserId') externalUserId: string,
  ) {
    return this.recipientsService.getRecipientByExternalId(tenantId, externalUserId);
  }
}
