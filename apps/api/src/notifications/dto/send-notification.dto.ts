import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChannelType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendNotificationDto {
  @ApiProperty({
    description: 'The external ID of the recipient user',
    example: 'customer_789',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  recipientId: string;

  @ApiProperty({
    description: 'The title of the notification',
    example: 'Order Shipped!',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @ApiProperty({
    description: 'The body content of the notification',
    example: 'Your order #1002 has been shipped and is on the way.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;

  @ApiProperty({
    description: 'The delivery channel type',
    enum: ChannelType,
    example: ChannelType.IN_APP,
  })
  @IsEnum(ChannelType)
  channel: ChannelType;

  @ApiPropertyOptional({
    description: 'Email address to associate with the recipient (EMAIL channel)',
    example: 'alice@example.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    description: 'Phone number in E.164 format to associate with the recipient (SMS channel)',
    example: '+251911234567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
