import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'The email address of the user who forgot their password',
    example: 'owner@acme.com',
  })
  email: string;
}
