import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Nginx (docker-compose.prod.yml) is the only path in, but it reaches this
  // container through Docker's published-port NAT, not literally over
  // loopback — from inside the container the connecting peer shows up as the
  // Docker bridge gateway (e.g. 172.x.0.1), not 127.0.0.1. 'loopback' alone
  // would NOT match that, silently leaving every request's sourceIp as the
  // bridge gateway instead of the real client. 'uniquelocal' additionally
  // trusts RFC1918 private ranges, which covers the bridge network without
  // trusting arbitrary internet IPs (the backend port is never published to
  // the internet — see docker-compose.prod.yml). This is what lets Express
  // resolve req.ip from the X-Forwarded-For header Nginx sets, instead of
  // Nginx's own address, so SecurityEvent.sourceIp reflects the real client.
  app.set('trust proxy', 'uniquelocal');

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
