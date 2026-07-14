import {
  Controller,
  Post,
  Req,
  Res,
  HttpCode,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { WebhooksService } from './webhooks.service';
import { Public } from '../auth/public.decorator';

@Public()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('d4sign')
  @HttpCode(200)
  async receive(@Req() req: Request, @Res() res: Response) {
    const signature = (req.headers['content-hmac'] as string) || '';
    const rawBody: Buffer = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));

    if (signature && !this.webhooksService.verifyHmac(rawBody, signature)) {
      this.logger.warn('Webhook recebido com HMAC inválido — rejeitado.');
      throw new UnauthorizedException('HMAC inválido');
    }

    const result = await this.webhooksService.handleEvent(req.body, rawBody);
    return res.json(result);
  }
}
