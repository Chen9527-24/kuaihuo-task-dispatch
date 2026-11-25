import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class DeepSeekChatTestDto {
  @ApiPropertyOptional({ description: '系统提示词', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  systemPrompt?: string;

  @ApiProperty({ description: '用户输入', maxLength: 10000 })
  @IsString()
  @MaxLength(10000)
  userPrompt!: string;

  @ApiPropertyOptional({ description: '模型名称，不传则使用 DEEPSEEK_MODEL', example: 'deepseek-v4-flash' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @ApiPropertyOptional({ description: '温度，0-2', example: 0.7 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ description: '最大输出 tokens', example: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4000)
  maxTokens?: number;

  @ApiPropertyOptional({ description: '是否启用 JSON 输出模式', example: false })
  @IsOptional()
  @IsBoolean()
  jsonMode?: boolean;
}
