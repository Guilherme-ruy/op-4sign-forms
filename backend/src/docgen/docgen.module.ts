import { Module } from '@nestjs/common';
import { DocgenService } from './docgen.service';

@Module({
  providers: [DocgenService],
  exports: [DocgenService],
})
export class DocgenModule {}
