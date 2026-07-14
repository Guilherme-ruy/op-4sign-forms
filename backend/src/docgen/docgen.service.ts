import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** Parser que faz trim no nome da tag antes de buscar no formData.
 *  Resolve placeholders com espaços acidentais como {{Q1 }} → chave "Q1". */
function trimParser(tag: string) {
  const key = tag.trim();
  return {
    get(scope: Record<string, string>) {
      return key in scope ? scope[key] : '';
    },
  };
}

const DOCX_OPTIONS = {
  delimiters: { start: '{{', end: '}}' },
  paragraphLoop: true,
  linebreaks: true,
  nullGetter: () => '',
  parser: trimParser,
} as const;

@Injectable()
export class DocgenService {
  private readonly logger = new Logger(DocgenService.name);
  private readonly outputDir: string;

  readonly previewDir: string;

  constructor() {
    this.outputDir = path.resolve(process.cwd(), '../data/generated');
    this.previewDir = path.resolve(process.cwd(), '../data/previews');
    for (const dir of [this.outputDir, this.previewDir]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }

  async generateDocument(templatePath: string, formData: Record<string, string>, forceDocx = false): Promise<string> {
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template DOCX não encontrado em: ${templatePath}`);
    }

    const templateBytes = fs.readFileSync(templatePath);
    const zip = new PizZip(templateBytes);

    const doc = new Docxtemplater(zip, DOCX_OPTIONS);

    doc.render(formData);

    const outputBytes = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    const baseName = `doc-${Date.now()}`;
    const docxPath = path.join(this.outputDir, `${baseName}.docx`);
    fs.writeFileSync(docxPath, outputBytes);
    this.logger.log(`DOCX gerado: ${docxPath}`);

    if (forceDocx) {
      this.logger.log('Ignorando conversão para PDF (forceDocx=true)');
      return docxPath;
    }

    try {
      const pdfPath = await this.convertDocxToPdf(docxPath);
      this.logger.log(`PDF gerado: ${pdfPath}`);
      return pdfPath;
    } catch (err: any) {
      this.logger.warn(`Conversão para PDF falhou (${err.message}), usando DOCX como fallback.`);
      return docxPath;
    }
  }

  async generatePreview(
    templatePath: string,
    formData: Record<string, string>,
  ): Promise<{ previewPath: string; isPdf: boolean }> {
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template DOCX não encontrado: ${templatePath}`);
    }

    this.cleanOldPreviews();

    const templateBytes = fs.readFileSync(templatePath);
    const zip = new PizZip(templateBytes);
    const doc = new Docxtemplater(zip, DOCX_OPTIONS);
    doc.render(formData);
    const outputBytes = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    const id = `preview-${Date.now()}`;
    const docxPath = path.join(this.previewDir, `${id}.docx`);
    fs.writeFileSync(docxPath, outputBytes);

    try {
      const pdfPath = await this.convertDocxToPdf(docxPath);
      fs.unlinkSync(docxPath);
      return { previewPath: pdfPath, isPdf: true };
    } catch (err: any) {
      this.logger.warn(`[generatePreview] Conversão PDF falhou — usando DOCX como fallback. Erro: ${err?.message ?? err}`);
      if (err?.response) {
        this.logger.warn(`[generatePreview] Gotenberg respondeu status ${err.response.status}: ${JSON.stringify(err.response.data)}`);
      }
      return { previewPath: docxPath, isPdf: false };
    }
  }

  private cleanOldPreviews(): void {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2 horas
    try {
      for (const file of fs.readdirSync(this.previewDir)) {
        const full = path.join(this.previewDir, file);
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      }
    } catch { /* sem impacto no fluxo */ }
  }

  async generateOverlayDocument(
    basePdfPath: string,
    fields: Array<{ variableName: string; options: string | null }>,
    formData: Record<string, string>,
    outDir?: string,
  ): Promise<string> {
    if (!fs.existsSync(basePdfPath)) {
      throw new Error(`PDF base não encontrado em: ${basePdfPath}`);
    }

    const pdfBytes = fs.readFileSync(basePdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    for (const field of fields) {
      if (!field.options) continue;

      let overlayOpts: {
        page?: number; x?: number; y?: number;
        width?: number; height?: number; fontSize?: number;
        checkValue?: string;
      } | null = null;
      try {
        const parsed = JSON.parse(field.options);
        if (parsed?.overlay) overlayOpts = parsed.overlay;
      } catch {
        continue;
      }

      if (!overlayOpts || overlayOpts.x == null || overlayOpts.y == null) continue;

      const rawValue = formData[field.variableName] ?? '';
      const checkValue = overlayOpts.checkValue;

      // Determina o que desenhar
      let drawCheckmark = false;
      let drawText: string | null = null;

      if (checkValue !== undefined) {
        // Modo rádio: só marca se o valor selecionado bate com este campo
        drawCheckmark = rawValue === checkValue;
      } else if (rawValue === '✓') {
        drawCheckmark = true;
      } else {
        const safe = rawValue.split('').filter((c) => c.charCodeAt(0) <= 255).join('');
        if (safe) drawText = safe;
      }

      if (!drawCheckmark && !drawText) continue;

      const pageIndex = (overlayOpts.page ?? 1) - 1;
      const page = pages[pageIndex];
      if (!page) continue;

      const { width: pageWidth, height: pageHeight } = page.getSize();
      const fontSize = overlayOpts.fontSize ?? 11;
      const fieldH = (overlayOpts.height ?? 0.025) * pageHeight;

      // x: direto (fração da largura)
      const pdfX = overlayOpts.x * pageWidth;
      // y: PDF tem eixo Y invertido (0 = base). Top da caixa no editor = pdfY + fieldH no PDF
      const pdfY = pageHeight - overlayOpts.y * pageHeight - fieldH;

      if (drawCheckmark) {
        // Desenha X sempre em área quadrada (menor lado), centralizado na caixa
        const boxW = (overlayOpts.width ?? 0.018) * pageWidth;
        const boxH = fieldH;
        const side = Math.min(boxW, boxH) * 0.65;
        const cx = pdfX + (boxW - side) / 2;
        const cy = pdfY + (boxH - side) / 2;
        page.drawLine({ start: { x: cx, y: cy }, end: { x: cx + side, y: cy + side }, thickness: 1.2, color: rgb(0, 0, 0) });
        page.drawLine({ start: { x: cx + side, y: cy }, end: { x: cx, y: cy + side }, thickness: 1.2, color: rgb(0, 0, 0) });
      } else if (drawText) {
        // Texto alinhado ao topo da caixa com pequena margem
        page.drawText(drawText, { x: pdfX, y: pdfY + (fieldH - fontSize) / 2, size: fontSize, font, color: rgb(0, 0, 0) });
      }
    }

    const outBytes = await pdfDoc.save();
    const dir = outDir ?? this.outputDir;
    const outPath = path.join(dir, `overlay-${Date.now()}.pdf`);
    fs.writeFileSync(outPath, outBytes);
    this.logger.log(`PDF overlay gerado: ${outPath}`);
    return outPath;
  }

  async getPdfPageCount(pdfPath: string): Promise<number> {
    const bytes = fs.readFileSync(pdfPath);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return doc.getPageCount();
  }

  private async convertDocxToPdf(docxPath: string): Promise<string> {
    const pdfPath = docxPath.replace(/\.docx$/, '.pdf');
    const gotenbergUrl = process.env.GOTENBERG_URL ?? 'http://gotenberg:3000';

    const form = new FormData();
    form.append('files', fs.createReadStream(docxPath), path.basename(docxPath));

    const response = await axios.post<Buffer>(
      `${gotenbergUrl}/forms/libreoffice/convert`,
      form,
      {
        headers: form.getHeaders(),
        responseType: 'arraybuffer',
        timeout: 60_000,
      },
    );

    fs.writeFileSync(pdfPath, Buffer.from(response.data));
    return pdfPath;
  }
}
