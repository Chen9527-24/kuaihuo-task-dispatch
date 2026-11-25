import { Body, Controller, UseGuards, ParseFilePipe, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { UploadFileDto } from './dto/upload-file.dto';
import { MemberUploadGuard } from './member-upload.guard';
import { FilesService } from './files.service';

@ApiTags('成员任务凭证')
@UseGuards(MemberUploadGuard)
@Public()
@Controller({ path: 'app/files', version: '1' })
export class MemberFilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @ApiOperation({ summary: '已登录成员上传任务凭证' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        scene: { type: 'string', example: 'TASK_CLAIM_PROOF' },
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
    @Body() dto: UploadFileDto,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true })) file: Express.Multer.File,
    @Req() req: Request & { memberId: string },
  ) {
    const saved = await this.filesService.uploadMemberProof(req.memberId, file, dto.scene);
    return await this.filesService.toResponse(saved, req);
  }

}
