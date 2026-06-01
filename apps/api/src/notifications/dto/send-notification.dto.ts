import { ApiProperty } from '@nestjs/swagger';
import { ChannelType } from '@prisma/client';

export class SendNotificationDto {
  @ApiProperty({
    description: 'The external ID of the recipient user',
    example: 'customer_789',
  })
  recipientId: string;

  @ApiProperty({
    description: 'The title of the notification',
    example: 'Order Shipped!',
  })
  title: string;

  @ApiProperty({
    description: 'The body content of the notification',
    example: 'Your order #1002 has been shipped and is on the way.',
  })
  body: string;

  @ApiProperty({
    description: 'The delivery channel type',
    enum: ChannelType,
    example: ChannelType.IN_APP,
  })
  channel: ChannelType;
}
