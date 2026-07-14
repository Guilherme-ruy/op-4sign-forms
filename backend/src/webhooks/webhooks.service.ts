import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService) {}

  verifyHmac(rawBody: Buffer, signature: string): boolean {
    const secret = process.env.D4SIGN_WEBHOOK_SECRET;
    if (!secret) return true; // sem secret configurado, aceita tudo (dev)
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  async handleEvent(payload: Record<string, unknown>, rawBody: Buffer) {
    const uuidDocument =
      (payload['uuid_document'] as string) ||
      (payload['uuid'] as string) ||
      null;

    const eventType = (payload['type_post'] as string) || 'unknown';

    this.logger.log(`Webhook recebido: ${eventType} — documento: ${uuidDocument}`);

    // Persiste o evento independentemente
    let submission = uuidDocument
      ? await this.prisma.submission.findFirst({
          where: { documentUUID: uuidDocument },
        })
      : null;

    if (submission) {
      await this.prisma.webhookEvent.create({
        data: {
          submissionId: submission.id,
          eventType,
          payload: JSON.stringify(payload),
        },
      });

      // Atualiza status se o evento indicar assinatura concluída
      if (eventType === 'signed' || payload['type_post'] === 'Signed') {
        await this.prisma.submission.update({
          where: { id: submission.id },
          data: { status: 'signed' },
        });
        this.logger.log(`Submission ${submission.id} marcada como signed.`);
      }
    } else {
      this.logger.warn(
        `Webhook recebido para documento desconhecido: ${uuidDocument}`,
      );
    }

    return { received: true };
  }
}
