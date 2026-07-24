import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class TwoFactorCodeDto {
  @ApiProperty({
    description: 'The 6-digit TOTP verification code from Authenticator app',
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}
