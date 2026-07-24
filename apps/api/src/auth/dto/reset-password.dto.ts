import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'The secure reset token received via console log / email',
    example: 'a68f44d5e...',
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  token: string;

  @ApiProperty({
    description: 'The new password to set for the user account',
    example: 'newSecurePassword123',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}
