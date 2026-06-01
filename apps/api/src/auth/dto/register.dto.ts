import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'The name of the company or tenant organization',
    example: 'Acme Corp',
  })
  companyName: string;

  @ApiProperty({
    description: 'Email address of the organization owner',
    example: 'owner@acme.com',
  })
  email: string;

  @ApiProperty({
    description: 'Password for the owner account',
    example: 'securePassword123',
  })
  password: string;
}
