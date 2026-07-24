import { ApiProperty } from '@nestjs/swagger';
import { ChannelType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
}
