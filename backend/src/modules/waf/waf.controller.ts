import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { WafService } from './waf.service';

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
