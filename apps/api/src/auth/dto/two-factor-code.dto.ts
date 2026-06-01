import { ApiProperty } from '@nestjs/swagger';

export class TwoFactorCodeDto {
  @ApiProperty({
    description: 'The 6-digit TOTP verification code from Authenticator app',
    example: '123456',
  })
  code: string;
}
