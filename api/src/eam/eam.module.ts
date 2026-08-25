import { Module } from '@nestjs/common';
import { EamController } from './eam.controller';
import { EamService } from './eam.service';

@Module({
  controllers: [EamController],
  providers: [EamService],
})
export class EamModule {}
