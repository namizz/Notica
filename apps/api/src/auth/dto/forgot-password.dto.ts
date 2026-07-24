import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'The email address of the user who forgot their password',
    example: 'owner@acme.com',
  })
  @IsEmail()
  @MaxLength(254)
  email: string;
}
