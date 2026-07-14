# Portal de Documentos e Assinaturas Digitais

Portal para geração, envio e acompanhamento de documentos com assinatura digital, integrado à API da **D4Sign**.

---

## Visão Geral

O sistema permite que administradores criem **modelos de documento** (PDF Overlay), gerem **links de preenchimento** para clientes e acompanhem todo o ciclo de assinatura em um único painel.

**Fluxo principal:**
1. Admin cria um modelo com campos posicionados visualmente sobre um PDF base
2. Admin gera um link (individual ou em lote) e envia ao cliente
3. Cliente acessa o link público, preenche o formulário e anexa documentos se necessário
4. O sistema gera o documento final e envia automaticamente para assinatura via D4Sign
5. Admin acompanha o status em tempo real no painel

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | NestJS · Prisma · SQLite |
| Frontend | Next.js 16 · Tailwind CSS · TanStack Query |
| Assinatura digital | D4Sign API |
| E-mail transacional | SMTP |
| Infraestrutura | Docker Compose |

---

## Estrutura do Repositório

```
/
├── backend/          # API REST (NestJS + Prisma)
├── frontend/         # Portal admin e formulário público (Next.js)
├── docs/             # Documentação técnica detalhada
├── data/             # Volume persistente (banco, anexos, previews) — não versionado
├── docker-compose.yml
└── dev.bat           # Atalho para iniciar o ambiente de desenvolvimento no Windows
```

---

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto (ao lado do `docker-compose.yml`) com as seguintes variáveis:

```env
# Banco de dados
DATABASE_URL=file:/data/db/portal.db

# Servidor
PORT=3001
JWT_SECRET=

# D4Sign
D4SIGN_BASE_URL=https://sandbox.d4sign.com.br/api/v1
D4SIGN_TOKEN_API=
D4SIGN_CRYPT_KEY=
D4SIGN_DRY_RUN=false

# E-mail (fallback de remetente; envio real é SMTP, configurado em /admin/email)
EMAIL_FROM_EMAIL=
EMAIL_FROM_NAME=

# URLs
FRONTEND_URL=https://seu-dominio.com.br
NEXT_PUBLIC_API_URL=https://seu-dominio.com.br/api

# Conversão de documentos
GOTENBERG_URL=http://gotenberg:3000
```

---

## Como Executar

### Desenvolvimento

```bash
# Backend
cd backend
npm install
npx prisma migrate dev
npm run start:dev

# Frontend (outro terminal)
cd frontend
npm install
npm run dev
```

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:3030`

### Produção (Docker)

```bash
# Na raiz do projeto, com o .env configurado:
docker compose up -d --build
```

Todos os serviços sobem automaticamente: backend, frontend e Gotenberg. Configure um reverse proxy (Nginx, Caddy, Traefik etc.) na frente das portas 3001 (API) e 3030 (frontend) conforme sua infraestrutura.

---

## Tipo de Modelo

| Tipo | Descrição |
|---|---|
| **PDF Overlay** | PDF base fixo com campos posicionados via editor visual. Ideal para formulários com layout rígido e checkboxes. |

---

## Documentação

A pasta `/docs` contém documentação detalhada de cada módulo:

- `overview.md` — arquitetura geral
- `modelos.md` — como criar e configurar modelos
- `links-de-envio.md` — geração de links e lotes
- `formulario-publico.md` — experiência do cliente
- `deploy.md` — guia de deploy em VPS Ubuntu
- `d4sign-api/` — referência da integração D4Sign

---

## Licença

MIT — veja [LICENSE](LICENSE).

---

## Autor

Desenvolvido por **Guilherme Ruy**  
[linkedin.com/in/guilherme-ruy-617b01256](https://br.linkedin.com/in/guilherme-ruy-617b01256)
