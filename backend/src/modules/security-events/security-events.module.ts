import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SecurityEventLogger } from './security-event-logger.service';
import { SecurityEventRepository } from './security-event.repository';

// Persistence (Phase 2) + BLOCK-only write path (Phase 8, ADR-3/ADR-4) +
// the read primitives the Admin API (Phase 9) queries through.
@Module({
  imports: [DatabaseModule],
  providers: [SecurityEventRepository, SecurityEventLogger],
  exports: [SecurityEventLogger, SecurityEventRepository],
})
export class SecurityEventsModule {}
