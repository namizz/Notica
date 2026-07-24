import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({
    description: 'The name of the project',
    example: 'Production App',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;
}
