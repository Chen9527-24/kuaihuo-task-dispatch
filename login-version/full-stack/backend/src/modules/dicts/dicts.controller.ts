import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDictItemDto, UpdateDictItemDto } from './dto/dict-item.dto';
import { CreateDictTypeDto, UpdateDictTypeDto } from './dto/dict-type.dto';
import { DictItemQueryDto, DictOptionsQueryDto, DictTypeQueryDto } from './dto/dict-query.dto';
import { DictsService } from './dicts.service';

@ApiTags('数据字典')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'dicts', version: '1' })
export class DictsController {
  constructor(private readonly dictsService: DictsService) {}

  @Get('options')
  @ApiOperation({ summary: '批量获取字典下拉选项' })
  @ApiOkResponse({ description: '获取成功' })
  options(@Query() query: DictOptionsQueryDto) {
    return this.dictsService.options(query);
  }

  @Get('types')
  @Permissions('dict:read')
  @ApiOperation({ summary: '字典类型列表' })
  listTypes(@Query() query: DictTypeQueryDto) {
    return this.dictsService.listTypes(query);
  }

  @Post('types')
  @Permissions('dict:create')
  @ApiOperation({ summary: '新增字典类型' })
  createType(@Body() dto: CreateDictTypeDto) {
    return this.dictsService.createType(dto);
  }

  @Patch('types/:id')
  @Permissions('dict:update')
  @ApiOperation({ summary: '编辑字典类型' })
  updateType(@Param('id') id: string, @Body() dto: UpdateDictTypeDto) {
    return this.dictsService.updateType(id, dto);
  }

  @Delete('types/:id')
  @Permissions('dict:delete')
  @ApiOperation({ summary: '删除字典类型' })
  removeType(@Param('id') id: string) {
    return this.dictsService.removeType(id);
  }

  @Get('items')
  @Permissions('dict:read')
  @ApiOperation({ summary: '字典项列表' })
  listItems(@Query() query: DictItemQueryDto) {
    return this.dictsService.listItems(query);
  }

  @Post('items')
  @Permissions('dict:create')
  @ApiOperation({ summary: '新增字典项' })
  createItem(@Body() dto: CreateDictItemDto) {
    return this.dictsService.createItem(dto);
  }

  @Patch('items/:id')
  @Permissions('dict:update')
  @ApiOperation({ summary: '编辑字典项' })
  updateItem(@Param('id') id: string, @Body() dto: UpdateDictItemDto) {
    return this.dictsService.updateItem(id, dto);
  }

  @Delete('items/:id')
  @Permissions('dict:delete')
  @ApiOperation({ summary: '删除字典项' })
  removeItem(@Param('id') id: string) {
    return this.dictsService.removeItem(id);
  }
}
