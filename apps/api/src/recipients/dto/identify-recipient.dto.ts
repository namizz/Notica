import { ApiProperty } from '@nestjs/swagger';

export class IdentifyRecipientDto {
  @ApiProperty({
    description: 'The external unique identifier for the recipient from your application',
    example: 'customer_789',
  })
  externalUserId: string;

  @ApiProperty({
    description: 'The email address of the recipient user',
    example: 'alice@domain.com',
    required: false,
  })
  email?: string;

  @ApiProperty({
    description: 'The display name of the recipient user',
    example: 'Alice Smith',
    required: false,
  })
  name?: string;
}
