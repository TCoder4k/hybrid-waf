import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { WafService } from './waf.service';

// RateLimitGuard (Phase P3, docs/architecture.md §22) runs before
// handleAll() — a rejected request never reaches WafService.handle(), i.e.
// never touches normalization or Rule/ML detection. Scoped to this
// controller only, not a global APP_GUARD — /auth/login and /admin/* are
// unaffected.
@UseGuards(RateLimitGuard)
@Controller()
export class WafController {
  constructor(private readonly wafService: WafService) {}

  @All('*')
  async handleAll(@Req() req: Request, @Res() res: Response): Promise<void> {
    const result = await this.wafService.handle(req);

    res.status(result.status);
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
    res.send(result.body);
  }
}
