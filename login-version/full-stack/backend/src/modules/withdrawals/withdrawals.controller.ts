import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApplyWithdrawalDto, MarkWithdrawalPaidDto, RejectWithdrawalDto, WithdrawalQueryDto } from './dto/withdrawal.dto';
import { WithdrawalsService } from './withdrawals.service';

@ApiTags('H5-微信零钱提现')
@Public()
@Controller({ path: 'app/distribution/withdrawals', version: '1' })
export class H5WithdrawalsController {
  constructor(private readonly service: WithdrawalsService) {}

  @Post()
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 用户发起微信零钱提现', description: '创建提现单、冻结余额，并在微信模式下发起商家转账，返回 package_info 给 H5 调起确认收款。' })
  apply(@Body() dto: ApplyWithdrawalDto, @Headers('authorization') authorization?: string) {
    return this.service.applyForH5(dto, authorization);
  }

  @Get()
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 用户提现记录' })
  list(@Query() query: WithdrawalQueryDto, @Headers('authorization') authorization?: string) {
    return this.service.listForH5(query, authorization);
  }

  @Get(':id')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 用户提现详情' })
  detail(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return this.service.getForH5(id, authorization);
  }

  @Post(':id/cancel')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 用户主动取消提现申请', description: '仅支持仍在本地待处理、且未进入微信确认收款参数状态的提现单。取消后释放冻结余额。' })
  cancel(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return this.service.cancelForH5(id, authorization);
  }

  @Post(':id/sync')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 主动同步微信提现状态', description: '用户完成微信确认收款后，H5 可主动查单并刷新本地提现状态，减少等待异步回调带来的状态滞后。' })
  sync(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return this.service.syncForH5(id, authorization);
  }

  @Post(':id/mock-confirm')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 模拟确认收款，仅 MOCK 模式可用' })
  mockConfirm(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return this.service.mockConfirmForH5(id, authorization);
  }
}

@ApiTags('管理端-提现管理')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'withdrawals', version: '1' })
export class WithdrawalsAdminController {
  constructor(private readonly service: WithdrawalsService) {}

  @Get()
  @Permissions('withdrawal:read')
  @ApiOperation({ summary: '提现单列表' })
  list(@Query() query: WithdrawalQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listAdmin(query, user);
  }

  @Get('export')
  @Permissions('withdrawal:read')
  @ApiOperation({ summary: '导出提现记录', description: '按当前筛选条件导出当前用户权限范围内的全部提现记录，不分页。' })
  export(@Query() query: WithdrawalQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.exportAdmin(query, user);
  }

  @Get(':id')
  @Permissions('withdrawal:read')
  @ApiOperation({ summary: '提现单详情' })
  detail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.detailAdmin(id, user);
  }

  @Post(':id/approve')
  @Permissions('withdrawal:update')
  @ApiOperation({ summary: '审核通过提现单。微信模式会立即调用商家转账接口。' })
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.approveAdmin(id, user);
  }

  @Post(':id/reject')
  @Permissions('withdrawal:update')
  @ApiOperation({ summary: '拒绝提现单并释放余额' })
  reject(@Param('id') id: string, @Body() dto: RejectWithdrawalDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.rejectAdmin(id, dto, user);
  }

  @Post(':id/mark-paid')
  @Permissions('withdrawal:update')
  @ApiOperation({ summary: '人工标记已打款。微信模式禁用此接口。' })
  markPaid(@Param('id') id: string, @Body() dto: MarkWithdrawalPaidDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.markPaidAdmin(id, dto, user);
  }

  @Post(':id/sync')
  @Permissions('withdrawal:update')
  @ApiOperation({ summary: '主动同步微信提现状态' })
  sync(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.syncAdmin(id, user);
  }

}

@ApiTags('微信支付-商家转账')
@Public()
@Controller({ path: 'wechatpay/transfer', version: '1' })
export class WechatPayTransferController {
  constructor(private readonly service: WithdrawalsService) {}

  @Post('notify')
  @ApiOperation({ summary: '微信支付商家转账回调' })
  async notify(@Headers() headers: Record<string, string | string[] | undefined>, @Req() request: Request, @Res() response: Response) {
    await this.service.handleWechatPayNotify(headers, request.body as Buffer);
    return response.status(200).json({ code: 'SUCCESS', message: '成功' });
  }

  @Get('query/:outBillNo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @Permissions('withdrawal:update')
  @ApiOperation({ summary: '按商户单号主动查询微信提现状态' })
  query(@Param('outBillNo') outBillNo: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.queryWechatByOutBillNo(outBillNo, user);
  }
}
