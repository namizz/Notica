import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: 'The name of the company or tenant organization',
    example: 'Acme Corp',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  companyName: string;

  @ApiProperty({
    description: 'Email address of the organization owner',
    example: 'owner@acme.com',
  })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    description: 'Password for the owner account',
    example: 'securePassword123',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
