import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class IssueClientTokenDto {
  @ApiProperty({
    description: 'The project-scoped external recipient identifier',
    example: 'customer_789',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  recipientId: string;
}
