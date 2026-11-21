import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DEVICE_EVENT_TYPES } from '../../sms-wire';

export class DeviceEventDataDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(255)
  partsSent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  simSlot?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(255)
  tpStatus?: number;

  @IsOptional()
  @IsIn(['send', 'delivery'])
  stage?: 'send' | 'delivery';

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z_]{2,40}$/)
  errorCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  errorMessage?: string;
}

export class DeviceEventDto {
  @ApiProperty({ example: '5b0e8c1a-3a52-4c0f-9e0b-6a3c2f7d9b10' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  eventId: string;

  @ApiProperty({ enum: DEVICE_EVENT_TYPES })
  @IsIn(DEVICE_EVENT_TYPES)
  type: (typeof DEVICE_EVENT_TYPES)[number];

  @ApiProperty()
  @IsUUID()
  messageId: string;

  @ApiProperty({ example: '2026-11-19T10:00:03Z' })
  @IsISO8601()
  occurredAt: string;

  @ApiProperty({ required: false, type: DeviceEventDataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceEventDataDto)
  data?: DeviceEventDataDto;
}

export class DeviceEventsDto {
  @ApiProperty({ type: [DeviceEventDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DeviceEventDto)
  events: DeviceEventDto[];
}
