import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token issued during login/registration',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVC...',
  })
  refreshToken: string;
}
