import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Email address of the dashboard user',
    example: 'owner@acme.com',
  })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    description: 'Password of the dashboard user',
    example: 'securePassword123',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
