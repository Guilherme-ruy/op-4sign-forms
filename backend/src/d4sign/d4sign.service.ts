import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FormData = require('form-data');
import axios from 'axios';

@Injectable()
export class D4SignService {
  private readonly logger = new Logger(D4SignService.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly cryptKey: string;
  private readonly dryRun: boolean;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.baseUrl = this.configService.get<string>('D4SIGN_BASE_URL') || '';
    this.token = this.configService.get<string>('D4SIGN_TOKEN_API') || '';
    this.cryptKey = this.configService.get<string>('D4SIGN_CRYPT_KEY') || '';
    const rawDryRun = this.configService.get<string>('D4SIGN_DRY_RUN');
    this.dryRun = rawDryRun === 'true';
    this.logger.log(`D4SignService initialized: dryRun=${this.dryRun}, rawValue=${rawDryRun}`);
  }

  private get authQuery() {
    return `tokenAPI=${this.token}&cryptKey=${this.cryptKey}`;
  }

  async listSafes(page = 1) {
    if (this.dryRun) {
      return [{ name_safe: 'TI', uuid_safe: 'dry-safe-ti', status: 'active' }];
    }
    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/safes?${this.authQuery}&pg=${page}`),
    );
    return response.data;
  }

  async getBalance() {
    if (this.dryRun) {
      return { credit: '999', sent: '372', used_balance: '372/999' };
    }
    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/account/balance?${this.authQuery}`),
    );
    return response.data;
  }

  async listDocuments(page = 1) {
    if (this.dryRun) return [];
    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/documents?${this.authQuery}&pg=${page}`),
    );
    return response.data;
  }

  /**
   * Faz upload de um arquivo DOCX/PDF para o cofre da D4Sign e retorna o UUID do documento criado.
   */
  async uploadDocument(
    safeUUID: string,
    filePath: string,
    docName: string,
  ): Promise<string> {
    if (this.dryRun) {
      this.logger.log(`[DryRun] Simulando upload de ${filePath}`);
      return `dry-doc-${Date.now()}`;
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo não encontrado para upload: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const url = `${this.baseUrl}/documents/${safeUUID}/upload?tokenAPI=${this.token}&cryptKey=${this.cryptKey}`;

    const safeDocName = docName
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[<>:"/\\|?*]/g, '')
      .trim() || 'documento';
    const filename = `${safeDocName}${ext}`;

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), { filename, contentType: mimeType });
    form.append('workflow', '2');

    this.logger.log(`Uploading document to D4Sign (multipart): ${url.split('?')[0]}`);

    const response = await axios.post(url, form, {
      headers: { ...form.getHeaders(), Accept: 'application/json' },
    });

    this.logger.log(`Upload response: ${JSON.stringify(response.data)}`);

    const data = response.data;
    const uuid = Array.isArray(data) ? data[0]?.uuid : data?.uuid;

    if (!uuid) {
      throw new Error(
        `Upload para D4Sign não retornou UUID. Resposta: ${JSON.stringify(data)}`,
      );
    }
    return uuid as string;
  }

  async getDocumentInfo(documentUuid: string) {
    if (this.dryRun) return [{ statusId: '1' }];
    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/documents/${documentUuid}?${this.authQuery}`)
    );
    return response.data;
  }

  async getDownloadUrl(documentUuid: string, type: 'ZIP' | 'PDF' = 'ZIP') {
    if (this.dryRun) {
      return { url: 'https://sandbox.d4sign.com.br/dry-run-download', name: 'dry-run.zip' };
    }
    const payload = { type, language: 'pt', document: 'true' };
    const response = await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/documents/${documentUuid}/download?${this.authQuery}`, payload)
    );
    return response.data;
  }

  async getDocumentDimensions(
    documentUuid: string,
    retries = 8,
    delayMs = 8000,
  ): Promise<{ page: number; width: number; height: number }[]> {
    if (this.dryRun) {
      return [1, 2, 3, 4].map((p) => ({ page: p, width: 595, height: 842 }));
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await firstValueFrom(
          this.httpService.get(
            `${this.baseUrl}/documents/${documentUuid}/dimensions?${this.authQuery}`,
          ),
        );
        
        let dimsArray: any[] = [];
        if (Array.isArray(response.data)) {
          dimsArray = response.data;
        } else if (response.data && Array.isArray(response.data.dimensions)) {
          dimsArray = response.data.dimensions;
        }

        if (dimsArray.length > 0) {
          this.logger.log(`dimensions response (attempt ${attempt}): ${JSON.stringify(dimsArray)}`);
          return dimsArray as { page: number; width: number; height: number }[];
        }
        throw new Error('empty or invalid response format');
      } catch (err: any) {
        this.logger.warn(`dimensions attempt ${attempt}/${retries} failed: ${err.message}`);
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
    throw new Error(`dimensions unavailable after ${retries} attempts`);
  }

  async addPins(
    documentUuid: string,
    pins: {
      email: string;
      page: number;
      page_width: number;
      page_height: number;
      position_x: number;
      position_y: number;
      type: number;
    }[],
  ) {
    if (this.dryRun) {
      this.logger.log(`[DryRun] Simulando addPins: ${pins.length} pin(s)`);
      return true;
    }
    const payload = {
      pins: pins.map((p) => ({ document: documentUuid, ...p })),
    };
    this.logger.log(`addPins payload: ${JSON.stringify(payload)}`);
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/documents/${documentUuid}/addpins?${this.authQuery}`,
          payload,
        ),
      );
      this.logger.log(`addPins response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (err: any) {
      const body = err?.response?.data ?? err?.response ?? err?.message;
      this.logger.error(`addPins error ${err?.response?.status}: ${JSON.stringify(body)}`);
      throw err;
    }
  }

  async addSigner(documentUuid: string, email: string, name: string): Promise<string> {
    if (this.dryRun) {
      this.logger.log(`[DryRun] Simulando addSigner para ${email}`);
      return `dry-key-${Date.now()}`;
    }

    const payload = {
      signers: [
        {
          email,
          act: '1',
          foreign: '0',
          certificadoicpbr: '0',
          assinatura_presencial: '0',
          embed_method_auth: 'email',
          nome: name,
        },
      ],
    };

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/documents/${documentUuid}/createlist?${this.authQuery}`,
        payload,
      ),
    );
    this.logger.log(`addSigner response: ${JSON.stringify(response.data)}`);

    const signerInfo = Array.isArray(response.data?.message) ? response.data.message[0] : null;
    const keySigner: string = signerInfo?.key_signer || '';
    if (!keySigner) {
      this.logger.warn(`addSigner: key_signer não encontrado na resposta para ${email}`);
    }
    this.logger.log(`addSigner: ${email} → key_signer=${keySigner}`);
    return keySigner;
  }

  async sendToSigners(documentUuid: string, message = '') {
    if (this.dryRun) {
      this.logger.log(`[DryRun] Simulando sendToSigners para ${documentUuid}`);
      return true;
    }

    const payload = {
      message,
      skip_email: '0',
      workflow: '0',
    };

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/documents/${documentUuid}/sendtosigner?${this.authQuery}`,
        payload,
      ),
    );
    this.logger.log(`sendToSigners response: ${JSON.stringify(response.data)}`);
    return response.data;
  }

  // Mantido para compatibilidade – usar uploadDocument + addSigner + sendToSigners no lugar
  async createDocumentFromTemplate(
    safeUuid: string,
    templateId: string,
    formValues: Record<string, string>,
    docName: string,
  ) {
    if (this.dryRun) return { uuid: `dry-doc-${Date.now()}` };

    const payload = {
      uuid_safe: safeUuid,
      uuid_template: templateId,
      name_document: docName,
      templates: formValues,
    };

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/documents/${templateId}/template?${this.authQuery}`,
        payload,
      ),
    );
    return response.data;
  }

  async createDocumentFromWordTemplate(
    safeUuid: string,
    templateId: string,
    variables: Record<string, string>,
    docName: string,
  ) {
    if (this.dryRun) {
      this.logger.log(`[DryRun] Simulando createDocumentFromWordTemplate`);
      return { uuid: `dry-doc-word-${Date.now()}` };
    }

    const url = `${this.baseUrl}/documents/${safeUuid}/makedocumentbytemplateword?tokenAPI=${this.token}&cryptKey=${this.cryptKey}`;
    
    // O payload esperado pela D4Sign para Word Templates
    const payload = {
      name_document: docName,
      templates: {
        [templateId]: variables
      }
    };

    this.logger.log(`Creating document from Word template: ${url.split('?')[0]} (Template ID: ${templateId})`);

    const response = await axios.post(
      url,
      payload,
      { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
    );

    this.logger.log(`Word template response: ${JSON.stringify(response.data)}`);
    return response.data;
  }
}
