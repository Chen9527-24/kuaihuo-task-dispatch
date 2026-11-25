import {
  Body,
  Controller,
  Get,
  ParseFilePipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompleteFileDto } from './dto/complete-file.dto';
import { PresignFileDto } from './dto/presign-file.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';

@ApiTags('文件管理')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'files', version: '1' })
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @Permissions('file:upload')
  @ApiOperation({ summary: '上传文件', description: '通用临时上传，新增业务保存时再绑定 fileId。' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        scene: { type: 'string', example: 'TASK_COVER' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ description: '上传成功' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async upload(
    @CurrentUser('id') userId: string,
    @Body() dto: UploadFileDto,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true })) file: Express.Multer.File,
    @Req() req: Request,
  ) {
    const saved = await this.filesService.upload(userId, file, dto.scene);
    return await this.filesService.toResponse(saved, req);
  }

  @Post('presign')
  @Permissions('file:upload')
  @ApiOperation({ summary: '申请直传签名', description: '生成 OSS 直传所需的签名地址和最终文件回显地址。' })
  @ApiOkResponse({ description: '签名生成成功' })
  async presign(@CurrentUser('id') userId: string, @Body() dto: PresignFileDto) {
    return this.filesService.createDirectUpload(userId, dto);
  }

  @Post('complete')
  @Permissions('file:upload')
  @ApiOperation({ summary: '完成直传登记', description: '前端直传 OSS 成功后，调用该接口把文件记录写入系统。' })
  @ApiOkResponse({ description: '登记成功' })
  async complete(
    @CurrentUser('id') userId: string,
    @Body() dto: CompleteFileDto,
    @Req() req: Request,
  ) {
    const saved = await this.filesService.completeDirectUpload(userId, dto);
    return await this.filesService.toResponse(saved, req);
  }

  @Get('mine')
  @Permissions('file:mine:read')
  @ApiOperation({ summary: '获取我的文件列表', description: '读取当前登录用户上传过的文件列表。' })
  @ApiOkResponse({ description: '获取成功' })
  async mine(@CurrentUser('id') userId: string, @Req() req: Request) {
    const files = await this.filesService.listMine(userId);
    return await Promise.all(files.map((file) => this.filesService.toResponse(file, req)));
  }
}
