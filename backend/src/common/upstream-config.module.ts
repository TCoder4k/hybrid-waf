import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { UpstreamConfigService } from './upstream-config.service';

@Module({
  imports: [DatabaseModule],
  providers: [UpstreamConfigService],
  exports: [UpstreamConfigService],
})
export class UpstreamConfigModule {}
