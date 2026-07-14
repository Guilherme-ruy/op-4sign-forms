import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  Request,
  NotFoundException,
  ConflictException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { LinksService } from './links.service';
import { Public } from '../auth/public.decorator';

const ALLOWED_MAGIC: { ext: string[]; check: (b: Buffer) => boolean }[] = [
  { ext: ['.pdf'], check: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  { ext: ['.docx', '.xlsx', '.pptx', '.zip'], check: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
  { ext: ['.jpg', '.jpeg'], check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: ['.png'], check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
];

function validateFileMagicBytes(buffer: Buffer, originalname: string) {
  if (buffer.length < 4) throw new BadRequestException('Arquivo inválido ou corrompido.');
  const ext = path.extname(originalname).toLowerCase();
  const rule = ALLOWED_MAGIC.find((r) => r.ext.includes(ext));
  if (!rule) throw new BadRequestException(`Tipo de arquivo não permitido: ${ext}`);
  if (!rule.check(buffer)) throw new BadRequestException('O conteúdo do arquivo não corresponde à extensão informada.');
}

@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('departmentIds') departmentIds?: string | string[],
    @Query('includeDeletedTemplates') includeDeletedTemplates?: string,
    @Query('findToken') findToken?: string,
    @Request() req?: any,
  ) {
    const depts = typeof departmentIds === 'string' ? [departmentIds] : departmentIds;
    return this.linksService.listLinks(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      req?.user,
      depts,
      includeDeletedTemplates === 'true',
      findToken,
    );
  }

  @Get('submissions/all')
  async findAllSubmissions(
    @Query('departmentIds') departmentIds?: string | string[],
    @Request() req?: any,
  ) {
    const depts = typeof departmentIds === 'string' ? [departmentIds] : departmentIds;
    return this.linksService.listSubmissions(req?.user, depts);
  }

  @Get('submissions')
  async findAllSubmissionsPaginated(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('departmentIds') departmentIds?: string | string[],
    @Request() req?: any,
  ) {
    const depts = typeof departmentIds === 'string' ? [departmentIds] : departmentIds;
    return this.linksService.listSubmissionsPaginated(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      req?.user,
      depts
    );
  }

  @Get('batches')
  async findAllBatches(@Request() req: any) {
    return this.linksService.listBatches(req.user);
  }

  @Get('stats')
  async getStats(
    @Query('departmentIds') departmentIds?: string | string[],
    @Request() req?: any,
  ) {
    const depts = typeof departmentIds === 'string' ? [departmentIds] : departmentIds;
    return this.linksService.getStats(req?.user, depts);
  }

  @Public()
  @Get('preview-file/:filename')
  servePreviewFile(@Param('filename') filename: string, @Res() res: Response) {
    const safeFilename = path.basename(filename);
    const filePath = path.resolve(process.cwd(), '../data/previews', safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Preview não encontrado ou expirado.' });
    }

    const ext = path.extname(safeFilename).toLowerCase();
    const contentType =
      ext === '.pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    return res.sendFile(filePath);
  }

  @Public()
  @Get(':token')
  async findOne(@Param('token') token: string) {
    try {
      return await this.linksService.getLinkByToken(token);
    } catch (error) {
      if (error.submissionStatus) {
        throw new ConflictException({ message: error.message, submissionStatus: error.submissionStatus });
      }
      throw new NotFoundException(error.message);
    }
  }

  @Post(':token/resend-email')
  async resendEmail(@Param('token') token: string) {
    try {
      return await this.linksService.resendEmail(token);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('batch')
  async createBatch(
    @Body() dto: {
      name: string;
      templateId: string;
      expiresInDays: number;
      rows: { clientName: string; clientEmail: string; additionalSigners?: string[] }[];
    },
    @Request() req: any,
  ) {
    return this.linksService.createBatch({ ...dto, createdById: req.user?.sub });
  }

  @Post()
  async create(
    @Body() createLinkDto: {
      templateId: string;
      clientName?: string;
      clientEmail?: string;
      additionalSigners?: string[];
      internalSigners?: string[];
      expiresInDays: number;
      recipientAssignments?: { order: number; email: string; name?: string }[];
    },
    @Request() req: any,
  ) {
    return this.linksService.createLink({ ...createLinkDto, createdById: req.user?.sub });
  }

  @Public()
  @Post(':token/preview')
  async generatePreview(
    @Param('token') token: string,
    @Body() body: { formData: Record<string, string> },
  ) {
    try {
      return await this.linksService.generatePreview(token, body.formData);
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }

  @Public()
  @Post(':token/submit')
  async submit(@Param('token') token: string, @Body() formData: Record<string, string>) {
    try {
      return await this.linksService.submitForm(token, formData);
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }

  @Public()
  @Post(':token/attachment/:attachmentId')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadAttachment(
    @Param('token') token: string,
    @Param('attachmentId') attachmentId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    validateFileMagicBytes(file.buffer, file.originalname);
    try {
      return await this.linksService.uploadAttachment(token, attachmentId, file);
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }

  @Public()
  @Delete(':token/attachment/:attachmentId')
  async deleteAttachment(
    @Param('token') token: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    await this.linksService.deleteAttachment(token, attachmentId);
    return { ok: true };
  }

  @Get('submissions/:submissionId/attachments')
  async getSubmissionAttachments(@Param('submissionId') submissionId: string) {
    return this.linksService.getSubmissionAttachments(submissionId);
  }

  @Post('submissions/:submissionId/retry')
  async retrySubmission(@Param('submissionId') submissionId: string) {
    try {
      return await this.linksService.retrySubmission(submissionId);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('submissions/sync-pending')
  async syncPendingSubmissions() {
    return this.linksService.syncPendingSubmissions();
  }

  @Post('submissions/:submissionId/sync')
  async syncSubmission(@Param('submissionId') submissionId: string) {
    return this.linksService.syncSubmission(submissionId);
  }

  @Post('submissions/:submissionId/download')
  async getSubmissionDownloadUrl(
    @Param('submissionId') submissionId: string,
    @Body('type') type?: 'ZIP' | 'PDF'
  ) {
    return this.linksService.getSubmissionDownloadUrl(submissionId, type || 'ZIP');
  }

  @Get('submissions/:submissionId/score')
  async getSubmissionScore(@Param('submissionId') submissionId: string) {
    return this.linksService.getSubmissionScore(submissionId);
  }

  @Get('submissions/:submissionId/details')
  async getSubmissionDetails(@Param('submissionId') submissionId: string) {
    return this.linksService.getSubmissionDetails(submissionId);
  }

  @Get('attachment-file/:submissionId/:filename')
  serveAttachmentFile(
    @Param('submissionId') submissionId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const safeFilename = path.basename(filename);
    const safeSubmissionId = path.basename(submissionId);
    const filePath = path.resolve(process.cwd(), '../data/attachments', safeSubmissionId, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Arquivo não encontrado.' });
    }

    const ext = path.extname(safeFilename).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf'
      : ['.jpg', '.jpeg'].includes(ext) ? 'image/jpeg'
      : ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
      : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.sendFile(filePath);
  }

  /** Serve a pending attachment from a completed RecipientSession (used by next recipient to view previous answers). */
  @Public()
  @Get('session-attachment/:sessionToken/:filename')
  serveSessionAttachmentFile(
    @Param('sessionToken') sessionToken: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const safeToken = path.basename(sessionToken);
    const safeFilename = path.basename(filename);
    const filePath = path.resolve(process.cwd(), '../data/pending-attachments', safeToken, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Arquivo não encontrado.' });
    }

    const ext = path.extname(safeFilename).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf'
      : ['.jpg', '.jpeg'].includes(ext) ? 'image/jpeg'
      : ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
      : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    return res.sendFile(filePath);
  }

  @Delete(':token/revoke')
  async revoke(@Param('token') token: string, @Request() req: any) {
    try {
      return await this.linksService.revokeLink(token, req.user);
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }

  @Post('bulk-revoke')
  async bulkRevoke(@Body('tokens') tokens: string[], @Request() req: any) {
    return this.linksService.bulkRevokeLinks(tokens, req.user);
  }
}
