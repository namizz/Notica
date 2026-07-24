import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentProject } from './decorators/current-project.decorator';
import { CurrentTenant } from './decorators/current-tenant.decorator';
import { IssueClientTokenDto } from './dto/issue-client-token.dto';
import { ClientTokensService } from './client-tokens.service';

@ApiTags('Client Tokens')
@UseGuards(AuthGuard('api-key'))
@Controller('client-tokens')
export class ClientTokensController {
  constructor(private readonly clientTokensService: ClientTokensService) {}

  @Post()
  @ApiOperation({
    summary: 'Issue a short-lived browser token scoped to one recipient',
  })
  @ApiHeader({
    name: 'x-api-key',
    description: 'Privileged server-side project API key',
    required: true,
  })
  @ApiResponse({ status: 201, description: 'Scoped client token issued.' })
  issue(
    @CurrentTenant() tenantId: string,
    @CurrentProject() projectId: string,
    @Body() dto: IssueClientTokenDto,
  ) {
    return this.clientTokensService.issueToken(
      tenantId,
      projectId,
      dto.recipientId,
    );
  }
}
