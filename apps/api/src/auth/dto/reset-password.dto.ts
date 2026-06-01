import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'The secure reset token received via console log / email',
    example: 'a68f44d5e...',
  })
  token: string;

  @ApiProperty({
    description: 'The new password to set for the user account',
    example: 'newSecurePassword123',
  })
  newPassword: string;
}
