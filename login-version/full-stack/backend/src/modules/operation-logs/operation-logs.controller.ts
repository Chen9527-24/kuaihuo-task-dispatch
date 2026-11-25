import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OperationLogQueryDto } from './dto/operation-log-query.dto';
import { OperationLogsService } from './operation-logs.service';

@ApiTags('操作日志')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'operation-logs', version: '1' })
export class OperationLogsController {
  constructor(private readonly service: OperationLogsService) {}

  @Get()
  @Permissions('operation-log:read')
  @ApiOperation({ summary: '操作日志列表' })
  list(@Query() query: OperationLogQueryDto) {
    return this.service.list(query);
  }
}
