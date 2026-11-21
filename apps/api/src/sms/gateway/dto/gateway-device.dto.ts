import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateGatewayDeviceDto {
  @ApiProperty({ example: 'Office phone' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class UpdateGatewayDeviceDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'SIM slot used for sending; null uses the phone default',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(7)
  defaultSimSlot?: number | null;

  @ApiProperty({
    required: false,
    description: 'Disabled devices stay paired but receive no new messages',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
