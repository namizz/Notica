import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface ProjectScopedRequest {
  user?: {
    projectId?: string;
  };
}

export const CurrentProject = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<ProjectScopedRequest>();
    return request.user?.projectId;
  },
);
