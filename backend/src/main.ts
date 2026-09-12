import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // The Dashboard (frontend/, Phase 10) is a browser app on a different
  // origin — scoped to one configurable origin, never a wildcard, per
  // docs/architecture.md §17 (least-privilege). No FRONTEND_URL means no
  // cross-origin admin API access at all.
  if (process.env.FRONTEND_URL) {
    app.enableCors({ origin: process.env.FRONTEND_URL });
  }
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
