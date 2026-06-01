import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'Email address of the dashboard user',
    example: 'owner@acme.com',
  })
  email: string;

  @ApiProperty({
    description: 'Password of the dashboard user',
    example: 'securePassword123',
  })
  password: string;
}
