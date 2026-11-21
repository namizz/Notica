import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ALL_EVENTS, WEBHOOK_EVENT_TYPES } from '../webhook-events';

const EVENT_CHOICES = [ALL_EVENTS, ...WEBHOOK_EVENT_TYPES];

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://example.com/notica/webhooks' })
  @IsUrl({ protocols: ['http', 'https'], require_tld: false, require_protocol: true })
  @MaxLength(2048)
  url: string;

  @ApiProperty({
    description: `Event types to receive, or "${ALL_EVENTS}" for all`,
    example: ['notification.delivered', 'notification.failed'],
    enum: EVENT_CHOICES,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(EVENT_CHOICES.length)
  @IsIn(EVENT_CHOICES, { each: true })
  events: string[];

  @ApiProperty({ required: false, example: 'Order system' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class UpdateWebhookDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false, require_protocol: true })
  @MaxLength(2048)
  url?: string;

  @ApiProperty({ required: false, enum: EVENT_CHOICES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(EVENT_CHOICES, { each: true })
  events?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
