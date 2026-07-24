import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

export class TwoFactorLoginDto {
  @ApiProperty({
    description: 'Email address of the dashboard user logging in',
    example: 'owner@acme.com',
  })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    description: 'The 6-digit TOTP verification code from Authenticator app',
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}
