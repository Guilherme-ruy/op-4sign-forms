import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  Request,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TemplatesService } from './templates.service';
import { Public } from '../auth/public.decorator';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  findAll(@Request() req: any, @Query('departmentIds') departmentIds?: string | string[]) {
    const depts = typeof departmentIds === 'string' ? [departmentIds] : departmentIds;
    return this.templatesService.findAll(req.user, depts);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  @Post()
  create(@Body() data: any) {
    if (!data?.departmentId) {
      throw new BadRequestException('Departamento é obrigatório');
    }
    return this.templatesService.create(data);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    if ('departmentId' in data && !data.departmentId) {
      throw new BadRequestException('Departamento é obrigatório');
    }
    return this.templatesService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.templatesService.remove(id);
  }

  @Post(':id/upload-docx')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadDocx(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    // Verifica magic bytes do ZIP (PK\x03\x04) — DOCX é um ZIP
    if (
      file.buffer.length < 4 ||
      file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b ||
      file.buffer[2] !== 0x03 || file.buffer[3] !== 0x04
    ) {
      throw new BadRequestException('O arquivo enviado não é um DOCX válido.');
    }
    return this.templatesService.uploadDocx(id, file.buffer, file.originalname);
  }

  @Public()
  @Get(':id/fields')
  getFields(@Param('id') id: string) {
    return this.templatesService.getFields(id);
  }

  @Put(':id/fields')
  updateFields(@Param('id') id: string, @Body() body: { fields: any[] }) {
    return this.templatesService.updateFields(id, body.fields);
  }

  @Post(':id/fields/assign-r1')
  assignFieldsToR1(@Param('id') id: string) {
    return this.templatesService.assignFieldsToR1(id);
  }

  @Public()
  @Get(':id/attachments')
  getAttachments(@Param('id') id: string) {
    return this.templatesService.getAttachments(id);
  }

  @Put(':id/attachments')
  updateAttachments(@Param('id') id: string, @Body() body: { attachments: any[] }) {
    return this.templatesService.updateAttachments(id, body.attachments);
  }

  @Post(':id/rescan')
  rescanDocx(@Param('id') id: string) {
    return this.templatesService.rescanDocx(id);
  }

  @Get(':id/download-docx')
  async downloadDocx(@Param('id') id: string, @Res() res: Response) {
    const template = await this.templatesService.findOne(id);
    if (!template.localTemplatePath || !fs.existsSync(template.localTemplatePath)) {
      throw new NotFoundException('Nenhum DOCX disponível para este modelo.');
    }
    const filename = `${template.name.replace(/[^a-zA-Z0-9_\-]/g, '_')}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.sendFile(path.resolve(template.localTemplatePath));
  }

  @Post(':id/upload-base-pdf')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadBasePdf(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    if (
      file.buffer.length < 4 ||
      file.buffer[0] !== 0x25 || file.buffer[1] !== 0x50 ||
      file.buffer[2] !== 0x44 || file.buffer[3] !== 0x46
    ) {
      throw new BadRequestException('O arquivo enviado não é um PDF válido.');
    }
    return this.templatesService.uploadBasePdf(id, file.buffer);
  }

  @Public()
  @Get(':id/base-pdf')
  async getBasePdf(@Param('id') id: string, @Res() res: Response) {
    const filePath = await this.templatesService.getBasePdfPath(id);
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    return res.sendFile(path.resolve(filePath));
  }

  @Public()
  @Get(':id/preview-overlay')
  async getPreviewOverlay(@Param('id') id: string, @Res() res: Response) {
    const filePath = await this.templatesService.getPreviewOverlayPath(id);
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    return res.sendFile(path.resolve(filePath));
  }

  @Public()
  @Get(':id/recipients')
  getRecipients(@Param('id') id: string) {
    return this.templatesService.getRecipients(id);
  }

  @Put(':id/recipients')
  updateRecipients(
    @Param('id') id: string,
    @Body() body: { recipients: { order: number; label: string; color: string; canSeePreviousAnswers?: boolean }[] },
  ) {
    return this.templatesService.updateRecipients(id, body.recipients);
  }
}
