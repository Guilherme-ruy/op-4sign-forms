import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DocgenService } from '../docgen/docgen.service';
import * as fs from 'fs';
import * as path from 'path';
import * as JSZip from 'jszip';

@Injectable()
export class TemplatesService {
  private readonly templatesDir = path.resolve(process.cwd(), 'templates');

  constructor(private prisma: PrismaService, private docgenService: DocgenService) {
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
  }

  async findAll(user?: { sub: string; role: string; departmentIds: string[] }, filterDepartmentIds?: string[]) {
    const where: any = { 
      deletedAt: null,
      OR: [
        { departmentId: null },
        { department: { deletedAt: null } }
      ]
    };

    let allowedDepts = user && user.role !== 'SUPER_ADMIN' ? (user.departmentIds || []) : null;
    let targetDepts = filterDepartmentIds && filterDepartmentIds.length > 0 ? filterDepartmentIds : allowedDepts;
    
    if (allowedDepts && filterDepartmentIds && filterDepartmentIds.length > 0) {
      targetDepts = filterDepartmentIds.filter(id => allowedDepts.includes(id));
    }

    if (targetDepts) {
      where.departmentId = { in: targetDepts };
    } else if (user && user.role !== 'SUPER_ADMIN') {
      // Se não for super admin e não tiver departamentos vinculados, não vê nada com departamento
      // Mas pode ver os sem departamento (OR acima já permite se departmentId for null)
      // Porém a lógica de targetDepts=allowedDepts forçaria ver apenas os dele.
    }

    // Mantém a trava adicional de OPERATOR se necessário (para compatibilidade legada)
    if (user?.role === 'OPERATOR') {
      where.userAccess = { some: { userId: user.sub } };
    }

    return this.prisma.documentTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        formFields: { orderBy: { order: 'asc' } },
        department: true,
      },
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id },
      include: { formFields: { orderBy: { order: 'asc' } } },
    });
    if (!template) throw new NotFoundException('Modelo não encontrado');
    return template;
  }

  async create(data: { name: string; description?: string; d4signTemplateId?: string; departmentId?: string; mode?: string }) {
    const documentType = data.name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.documentTemplate.create({
        data: { ...data, documentType, mode: data.mode ?? 'template' },
      });
      await tx.templateRecipient.create({
        data: { templateId: template.id, order: 1, label: 'Respons\u00e1vel', color: '#3B82F6' },
      });
      return template;
    });
  }

  async assignFieldsToR1(templateId: string) {
    await this.findOne(templateId);
    await this.prisma.templateField.updateMany({
      where: { templateId, recipientOrder: null },
      data: { recipientOrder: 1 },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.documentTemplate.update({ where: { id }, data });
  }

  async remove(id: string) {
    const template = await this.findOne(id);

    // Remove o arquivo DOCX local, mas mantém o registro e todos os links (soft delete)
    if (template.localTemplatePath && fs.existsSync(template.localTemplatePath)) {
      fs.unlinkSync(template.localTemplatePath);
    }

    return this.prisma.documentTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), localTemplatePath: null },
    });
  }

  async uploadDocx(id: string, fileBuffer: Buffer, originalName: string) {
    await this.findOne(id);

    const ext = path.extname(originalName).toLowerCase();
    if (ext !== '.docx') throw new Error('Apenas arquivos .docx são aceitos');

    const destPath = path.join(this.templatesDir, `${id}.docx`);
    fs.writeFileSync(destPath, fileBuffer);

    await this.prisma.documentTemplate.update({
      where: { id },
      data: { localTemplatePath: destPath },
    });

    const variables = await this.extractVariables(fileBuffer);
    await this.syncFields(id, variables);

    return { localTemplatePath: destPath, detectedVariables: variables };
  }

  async getFields(templateId: string) {
    await this.findOne(templateId);
    return this.prisma.templateField.findMany({
      where: { templateId },
      orderBy: { order: 'asc' },
    });
  }

  async updateFields(
    templateId: string,
    fields: {
      id?: string;
      variableName: string;
      label: string;
      fieldType: string;
      required: boolean;
      placeholder?: string;
      options?: string;
      order: number;
      recipientOrder?: number | null;
    }[],
  ) {
    await this.findOne(templateId);

    return this.prisma.$transaction(async (tx) => {
      await tx.templateField.deleteMany({ where: { templateId } });

      return tx.templateField.createMany({
        data: fields.map((f) => ({
          templateId,
          variableName: f.variableName,
          label: f.label,
          fieldType: f.fieldType,
          required: f.required,
          placeholder: f.placeholder ?? null,
          options: f.options ?? null,
          order: f.order,
          recipientOrder: f.recipientOrder ?? null,
        })),
      });
    });
  }

  private async extractVariables(fileBuffer: Buffer): Promise<string[]> {
    const zip = await JSZip.loadAsync(fileBuffer);

    const xmlFiles = ['word/document.xml', 'word/header1.xml', 'word/header2.xml', 'word/footer1.xml', 'word/footer2.xml'];

    let fullText = '';
    for (const name of xmlFiles) {
      const f = zip.file(name);
      if (f) fullText += await f.async('text');
    }

    // Strip all XML tags then search for {{VARIABLE_NAME}}
    // \s* before }} tolerates trailing spaces inside placeholders (e.g. {{Q1 }})
    const plain = fullText.replace(/<[^>]+>/g, '');
    const matches = [...plain.matchAll(/\{\{([A-Z][A-Z0-9_]*)\s*\}\}/g)];
    const unique = [...new Set(matches.map((m) => m[1]))];
    return unique;
  }

  async rescanDocx(id: string) {
    const template = await this.findOne(id);
    if (!template.localTemplatePath || !fs.existsSync(template.localTemplatePath)) {
      throw new Error('Nenhum DOCX enviado para este modelo ainda.');
    }
    const fileBuffer = fs.readFileSync(template.localTemplatePath);
    const variables = await this.extractVariables(fileBuffer);
    await this.syncFields(id, variables);
    return { detectedVariables: variables };
  }

  private async syncFields(templateId: string, variables: string[]) {
    const newSet = new Set(variables);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.templateField.findMany({ where: { templateId } });
      const existingNames = new Set(existing.map((f) => f.variableName));

      // Remove campos cujas variáveis não existem mais no novo DOCX
      const toDelete = existing.filter((f) => !newSet.has(f.variableName)).map((f) => f.id);
      if (toDelete.length > 0) {
        await tx.templateField.deleteMany({ where: { id: { in: toDelete } } });
      }

      // Adiciona campos novos detectados
      const toCreate = variables.filter((v) => !existingNames.has(v));
      const maxOrder = existing.reduce((max, f) => Math.max(max, f.order), -1);
      for (let i = 0; i < toCreate.length; i++) {
        const v = toCreate[i];
        await tx.templateField.create({
          data: {
            templateId,
            variableName: v,
            label: this.toLabel(v),
            fieldType: this.guessFieldType(v),
            required: true,
            order: maxOrder + 1 + i,
          },
        });
      }
    });
  }

  async uploadBasePdf(id: string, fileBuffer: Buffer) {
    await this.findOne(id);

    if (fileBuffer.length < 4 ||
      fileBuffer[0] !== 0x25 || fileBuffer[1] !== 0x50 ||
      fileBuffer[2] !== 0x44 || fileBuffer[3] !== 0x46) {
      throw new Error('O arquivo enviado não é um PDF válido.');
    }

    const destPath = path.join(this.templatesDir, `${id}-base.pdf`);
    fs.writeFileSync(destPath, fileBuffer);

    await this.prisma.documentTemplate.update({
      where: { id },
      data: { basePdfPath: destPath },
    });

    return { basePdfPath: destPath };
  }

  async getBasePdfPath(id: string): Promise<string> {
    const template = await this.findOne(id);
    if (!template.basePdfPath || !fs.existsSync(template.basePdfPath)) {
      throw new NotFoundException('Nenhum PDF base disponível para este modelo.');
    }
    return template.basePdfPath;
  }

  async getPreviewOverlayPath(id: string): Promise<string> {
    const template = await this.findOne(id);
    if (!template.basePdfPath || !fs.existsSync(template.basePdfPath)) {
      throw new NotFoundException('Nenhum PDF base disponível para este modelo.');
    }

    const fields = await this.prisma.templateField.findMany({
      where: { templateId: id },
    });

    const formData: Record<string, string> = {};
    for (const f of fields) {
      if (f.fieldType === 'checkbox') {
        let checkValue = undefined;
        try {
          const parsed = JSON.parse(f.options || '{}');
          checkValue = parsed?.overlay?.checkValue;
        } catch {}
        formData[f.variableName] = checkValue ?? '✓'; // force tick if no checkValue
      } else {
        formData[f.variableName] = `«${f.label || f.variableName}»`;
      }
    }

    const outPath = await this.docgenService.generateOverlayDocument(
      template.basePdfPath,
      fields.map(f => ({ variableName: f.variableName, options: f.options })),
      formData,
      this.docgenService.previewDir
    );

    return outPath;
  }

  async getAttachments(templateId: string) {
    return this.prisma.templateAttachment.findMany({
      where: { templateId, deletedAt: null },
      orderBy: { order: 'asc' },
    });
  }

  async updateAttachments(
    templateId: string,
    attachments: { label: string; required: boolean; order: number; recipientOrder?: number | null; visibleToOrders?: string | null }[],
  ) {
    await this.findOne(templateId);
    return this.prisma.$transaction(async (tx) => {
      // Soft-delete all active slots — preserves FK integrity with SubmissionAttachment
      await tx.templateAttachment.updateMany({
        where: { templateId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      return tx.templateAttachment.createMany({
        data: attachments.map((a) => ({
          templateId,
          label: a.label,
          required: a.required,
          order: a.order,
          recipientOrder: a.recipientOrder ?? null,
          visibleToOrders: a.visibleToOrders ?? null,
        })),
      });
    });
  }

  async getRecipients(templateId: string) {
    await this.findOne(templateId);
    return this.prisma.templateRecipient.findMany({
      where: { templateId },
      orderBy: { order: 'asc' },
    });
  }

  async updateRecipients(
    templateId: string,
    recipients: { order: number; label: string; color: string; canSeePreviousAnswers?: boolean }[],
  ) {
    await this.findOne(templateId);
    return this.prisma.$transaction(async (tx) => {
      await tx.templateRecipient.deleteMany({ where: { templateId } });
      if (recipients.length === 0) return [];
      return tx.templateRecipient.createMany({
        data: recipients.map((r) => ({
          templateId,
          order: r.order,
          label: r.label,
          color: r.color,
          canSeePreviousAnswers: r.canSeePreviousAnswers ?? false,
        })),
      });
    });
  }

  private toLabel(variable: string): string {
    return variable
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private guessFieldType(variable: string): string {
    const v = variable.toLowerCase();
    if (v.includes('email')) return 'email';
    if (v.includes('date') || v.includes('data')) return 'date';
    if (v.includes('cnpj') || v.includes('tax_id')) return 'cnpj';
    if (v.includes('cpf')) return 'cpf';
    if (v.includes('phone') || v.includes('telefone') || v.includes('fone')) return 'phone';
    return 'text';
  }
}
