import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class TaskOrderQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'CLAIMED', description: '参与状态筛选：STARTED / CLAIMED / COMPLETED。' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  status?: string;

  @ApiPropertyOptional({ example: 'UNSETTLED', description: '结算状态筛选：UNSETTLED / SETTLED / REJECTED。' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  settlementStatus?: string;

  @ApiPropertyOptional({ example: '1381234', description: '手机号模糊搜索。' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  phone?: string;

  @ApiPropertyOptional({ example: 'Qiu', description: '姓名模糊搜索。' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  visitorName?: string;

  @ApiPropertyOptional({ example: true, description: '仅查询已提交个人凭证的订单。' })
  @IsOptional()
  @Transform(({ obj, key }) => obj?.[key] === true || obj?.[key] === 'true' || obj?.[key] === '1')
  @IsBoolean()
  hasProof?: boolean;

  @ApiPropertyOptional({
    enum: ['legacy', 'optimized'],
    example: 'optimized',
    description: 'legacy 保持历史原图 URL 字段；optimized 返回文件描述符，由前端按需申请缩略图或原图访问地址。',
  })
  @IsOptional()
  @IsIn(['legacy', 'optimized'])
  mediaMode?: 'legacy' | 'optimized';
}

export class TaskOrderMediaAccessQueryDto {
  @ApiPropertyOptional({ enum: ['thumbnail', 'original'], default: 'original', description: 'thumbnail 优先返回缩略图；旧文件无缩略图时自动回退原图。' })
  @IsOptional()
  @IsIn(['thumbnail', 'original'])
  variant?: 'thumbnail' | 'original';
}

export class SettleTaskOrderDto {
  @ApiProperty({ example: 1280, description: '结算金额（分），例如 12.80 元传 1280。' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  settlementAmount!: number;

  @ApiPropertyOptional({ example: 'cm9m3q0re0002abc123def456', description: '打款截图文件 ID（可选，先调用上传接口并指定结算场景）。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  settlementProofFileId?: string;

  @ApiPropertyOptional({ example: 'ALIPAY202604220001', description: '付款订单号（可选，手动输入）。' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  settlementOrderNo?: string;

  @ApiPropertyOptional({ example: '已通过支付宝打款', description: '结算备注。' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  settlementRemark?: string;
}

export class RejectTaskOrderDto {
  @ApiProperty({ example: '上传凭证与评论内容不匹配，已驳回，请重新上传。', description: '驳回原因，必填。' })
  @IsString()
  @Length(1, 255)
  rejectReason!: string;
}
