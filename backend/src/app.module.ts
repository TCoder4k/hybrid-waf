import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WafModule } from './modules/waf/waf.module';
import { RequestModule } from './modules/request/request.module';
import { DetectionModule } from './modules/detection/detection.module';
import { DecisionModule } from './modules/decision/decision.module';
import { SecurityEventsModule } from './modules/security-events/security-events.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';

// Import order matters here: WafController owns a catch-all `@All('*')`
// route (docs/architecture.md §4), and Nest/Express resolve overlapping
// routes in registration order — first match wins, and the WAF's handler
// never calls next(). AuthModule/AdminModule (§11, §13) MUST be imported
// before WafModule, or `/auth/login` and `/admin/*` get silently swallowed
// by the proxy instead of reaching their own controllers (caught live in
// Phase 9 — see docs/memory.md). Guarded by
// test/app-route-precedence.e2e-spec.ts.
@Module({
  imports: [
    AuthModule,
    AdminModule,
    RequestModule,
    DetectionModule,
    DecisionModule,
    SecurityEventsModule,
    WafModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
