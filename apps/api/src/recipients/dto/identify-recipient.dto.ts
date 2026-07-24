import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class IdentifyRecipientDto {
  @ApiProperty({
    description:
      'The external unique identifier for the recipient from your application',
    example: 'customer_789',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  externalUserId: string;

  @ApiProperty({
    description: 'The email address of the recipient user',
    example: 'alice@domain.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({
    description: 'The display name of the recipient user',
    example: 'Alice Smith',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;
}
