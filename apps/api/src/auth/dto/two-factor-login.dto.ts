import { ApiProperty } from '@nestjs/swagger';

export class TwoFactorLoginDto {
  @ApiProperty({
    description: 'Email address of the dashboard user logging in',
    example: 'owner@acme.com',
  })
  email: string;

  @ApiProperty({
    description: 'The 6-digit TOTP verification code from Authenticator app',
    example: '123456',
  })
  code: string;
}
