import { PlatformType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEnum, IsOptional } from 'class-validator';

export class RegisterDeviceTokenDto {
  @ApiProperty({
    description: 'Browser PushSubscription JSON or a serialized token',
  })
  @IsDefined()
  token: unknown;

  @ApiProperty({
    enum: PlatformType,
    default: PlatformType.WEB,
    required: false,
  })
  @IsOptional()
  @IsEnum(PlatformType)
  platform?: PlatformType;
}
