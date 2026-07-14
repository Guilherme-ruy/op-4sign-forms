import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Controller('preview')
export class PreviewController {
  @Get('f150r02')
  serveF150R02(@Res() res: Response) {
    const filePath = path.resolve(process.cwd(), '../data/generated/f150r02_base.html');

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Documento de preview não encontrado.');
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Forçamos a remoção do X-Frame-Options
    res.removeHeader('X-Frame-Options');
    // Adicionamos CSP para permitir frames de qualquer origem (necessário para acesso via IP/Portas diferentes)
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    
    return res.send(content);
  }
}
