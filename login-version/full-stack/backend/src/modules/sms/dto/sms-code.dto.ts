import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export const SMS_CODE_SCENES = ['login', 'profile', 'leader_bind', 'task_account'] as const;
export type SmsCodeScene = (typeof SMS_CODE_SCENES)[number];

export class SendSmsCodeDto {
  @ApiProperty({ example: '1XXXXXXXXXX', description: '接收验证码的手机号。' })
  @IsString()
  @Length(11, 11)
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;

  @ApiProperty({ enum: SMS_CODE_SCENES, example: 'login', description: '验证码业务场景。' })
  @IsIn(SMS_CODE_SCENES)
  scene!: SmsCodeScene;
}

export class VerifySmsCodeDto extends SendSmsCodeDto {
  @ApiProperty({ example: 'XXXXXX', description: '短信验证码。' })
  @IsString()
  @Length(4, 12)
  code!: string;
}

export class SmsCodeFieldDto {
  @ApiPropertyOptional({ example: 'XXXXXX', description: '短信验证码。本机模拟模式由页面自动填入，正式模式使用本人收到的短信验证码。' })
  @IsOptional()
  @IsString()
  @Length(4, 12)
  smsCode?: string;
}
