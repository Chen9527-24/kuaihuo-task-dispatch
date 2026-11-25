import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ApplyWithdrawalDto {
  @ApiProperty({ example: 100, description: '提现金额，单位：分。' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ example: '提现到微信零钱', description: '用户侧备注，最多 100 个字符。' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  remark?: string;
}

export class WithdrawalQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'PENDING', description: '提现状态。' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  status?: string;

  @ApiPropertyOptional({ example: '1XXXXXXXXXX', description: '手机号、昵称、openid、商户单号或微信单号关键词。' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  keyword?: string;

  @ApiPropertyOptional({ example: 'tenant-id-or-code', description: '租户 ID 或编码。平台管理员可筛选；租户用户会自动限制在当前租户。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  tenantId?: string;

  @ApiPropertyOptional({ example: 'WECHAT', description: '转账模式：WECHAT / MANUAL / MOCK。' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  transferMode?: string;


  @ApiPropertyOptional({ example: 'app_user_id_1,app_user_id_2', description: '仅供测试清理范围直达使用：按多个 H5 用户 ID 精确筛选提现记录，最多 100 条。' })
  @IsOptional()
  @IsString()
  @Length(1, 7000)
  appUserIds?: string;
}

export class RejectWithdrawalDto {
  @ApiProperty({ example: '资料异常，暂不支持提现。' })
  @IsString()
  @Length(1, 255)
  rejectReason!: string;
}

export class MarkWithdrawalPaidDto {
  @ApiPropertyOptional({ example: 'FINANCE202605280001', description: '人工或模拟打款流水号。' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  tradeNo?: string;

  @ApiPropertyOptional({ example: '财务已线下确认。' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  remark?: string;
}
