import { Module } from '@nestjs/common';
import { EhsService } from './ehs.service';
import { EhsController } from './ehs.controller';

@Module({
  controllers: [EhsController],
  providers: [EhsService],
})
export class EhsModule {}
