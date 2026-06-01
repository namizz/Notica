import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    // Assuming the user object is attached to the request by Passport
    // and that it contains a tenantId. This works for both JwtStrategy and ApiKeyStrategy.
    return request.user?.tenantId;
  },
);
