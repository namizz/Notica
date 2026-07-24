import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token issued during login/registration',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVC...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken: string;
}
