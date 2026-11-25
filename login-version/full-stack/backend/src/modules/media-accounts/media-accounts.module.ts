import { Module } from '@nestjs/common';
import { MediaAccountsController } from './media-accounts.controller';
import { MediaAccountsService } from './media-accounts.service';

@Module({
  controllers: [MediaAccountsController],
  providers: [MediaAccountsService],
  exports: [MediaAccountsService],
})
export class MediaAccountsModule {}
