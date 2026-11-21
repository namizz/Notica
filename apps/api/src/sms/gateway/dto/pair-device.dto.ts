import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SimInfoDto {
  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  @Max(7)
  slot: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  subscriptionId?: number;

  @ApiProperty({ example: 'Ethio telecom', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  carrier?: string;
}

export class DeviceInfoDto {
  @ApiProperty({ example: 'Pixel 7', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @ApiProperty({ example: 34, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  androidSdk?: number;

  @ApiProperty({ example: '1.0.0', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;

  @ApiProperty({ type: [SimInfoDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => SimInfoDto)
  sims?: SimInfoDto[];
}

export class PairDeviceDto {
  @ApiProperty({ example: 'K7PQ-2XMD' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  code: string;

  @ApiProperty({ type: DeviceInfoDto })
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  device: DeviceInfoDto;
}
