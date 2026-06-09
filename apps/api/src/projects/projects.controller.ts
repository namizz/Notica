import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project for the active tenant' })
  @ApiResponse({ status: 201, description: 'Project created successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  create(
    @CurrentTenant() tenantId: string,
    @Body() createProjectDto: CreateProjectDto,
  ) {
    return this.projectsService.createProject(tenantId, createProjectDto.name);
  }

  @Get()
  @ApiOperation({ summary: 'List all projects for the active tenant' })
  @ApiResponse({ status: 200, description: 'List of projects returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.projectsService.getProjects(tenantId);
  }

  @Post(':id/rotate-key')
  @ApiOperation({ summary: 'Rotate the API key for a project' })
  @ApiResponse({ status: 200, description: 'API key rotated successfully.' })
  @ApiResponse({ status: 404, description: 'Project not found or access denied.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  rotateKey(
    @CurrentTenant() tenantId: string,
    @Param('id') projectId: string,
  ) {
    return this.projectsService.rotateApiKey(tenantId, projectId);
  }

  @Post(':id/reveal')
  @ApiOperation({ summary: 'Reveal the API key for a project' })
  @ApiResponse({ status: 200, description: 'API key returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  revealKey(
    @CurrentTenant() tenantId: string,
    @Param('id') projectId: string,
    @Body() body: { code: string },
    @Req() req: any,
  ) {
    const userId = req.user?.userId;
    return this.projectsService.revealApiKey(tenantId, projectId, userId, body.code);
  }
}
