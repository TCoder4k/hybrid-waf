import { Module } from '@nestjs/common';
import { RequestNormalizerService } from './request-normalizer.service';

// Extract + Normalize stage (see docs/architecture.md §5).
@Module({
  providers: [RequestNormalizerService],
  exports: [RequestNormalizerService],
})
export class RequestModule {}
