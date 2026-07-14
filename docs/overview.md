# Portal D4Sign — Visão Geral

## O que é

Sistema para geração e envio de documentos para assinatura digital via D4Sign. O fluxo central é:

1. Admin cria um **Modelo** (PDF base com campos posicionados visualmente)
2. Admin gera um **Link de Envio** para um cliente específico
3. Cliente acessa o link, preenche o formulário e visualiza o documento preenchido
4. Ao confirmar, o sistema gera o PDF final, faz upload para o D4Sign, adiciona os signatários e dispara o envio para assinatura
5. D4Sign notifica o sistema via **webhook** quando o documento é assinado

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | NestJS + Prisma (SQLite) |
| Frontend | Next.js 16 (App Router) + React 19 |
| Autenticação | JWT (8h) via `@nestjs/passport` + `passport-jwt` |
| Banco de dados | SQLite (`backend/prisma/dev.db`) |
| E-mail | SMTP |
| Assinatura digital | D4Sign (sandbox em dev / `secure.d4sign.com.br` em produção) |
| Geração de documentos | PDF Overlay (campos posicionados sobre PDF base) |
| Rate limiting | `@nestjs/throttler` — 100 req/min global, 10/min no login, 5/h no forgot-password |

---

## Estrutura de diretórios

```
/
├── backend/                  # NestJS API
│   ├── prisma/
│   │   ├── schema.prisma     # Modelos do banco
│   │   ├── seed.ts           # Admin padrão
│   │   └── dev.db            # SQLite
│   └── src/
│       ├── auth/             # JWT, guards, decorators
│       ├── users/            # CRUD de usuários e permissões
      ├── departments/      # Gestão de departamentos (setores)
│       ├── templates/        # Modelos de documento
│       ├── links/            # Links de envio + submissões
│       ├── docgen/           # Geração de PDF Overlay
│       ├── d4sign/           # Integração D4Sign
│       ├── webhooks/         # Recepção de eventos D4Sign
│       ├── email/            # Envio via SMTP
│       └── dashboard.service.ts
│
├── frontend/                 # Next.js App Router
│   └── src/
│       ├── app/
│       │   ├── admin/
│       │   │   ├── page.tsx             # Dashboard
│       │   │   ├── templates/page.tsx   # Modelos
│       │   │   ├── links/page.tsx       # Links de Envio
│       │   │   ├── documents/page.tsx   # Documentos
│       │   │   ├── reports/page.tsx     # Relatórios
│       │   │   ├── users/page.tsx       # Usuários (ADMIN)
│       │   │   └── layout.tsx           # Proteção de rota
│       │   ├── login/page.tsx
│       │   └── public/[token]/page.tsx  # Formulário público
│       ├── contexts/AuthContext.tsx
│       ├── components/layout/Sidebar.tsx
│       └── lib/api.ts
│
└── docs/                     # Esta documentação
```

---

## Modelos do banco (Prisma)

| Modelo | Descrição |
|---|---|
| `User` | Usuários do sistema (`SUPER_ADMIN`, `ADMIN`, `OPERATOR`) |
| `Department` | Departamentos da empresa (RH, Financeiro, T.I., etc.) |
| `UserDepartment` | Vínculo N:N entre usuários e departamentos |
| `DocumentTemplate` | Templates de documento vinculados a um departamento |
| `LinkBatch` | Agrupamento de links gerados em massa |
| `PublicLink` | Link individual de preenchimento enviado ao cliente |
| `Submission` | Registro de preenchimento do formulário |

---

## Perfis de acesso e Isolamento

O sistema utiliza um modelo de **Isolamento por Departamento (Multi-tenancy)**:

| Perfil | Permissões |
|---|---|
| `SUPER_ADMIN` | **Visão Global.** Acesso irrestrito a todos os departamentos, usuários e configurações. Único perfil que pode gerenciar outros usuários. |
| `ADMIN` | **Visão Departamental.** Acesso total aos modelos, links e relatórios dos departamentos aos quais está vinculado. |
| `OPERATOR` | **Acesso Restrito.** Vê apenas os modelos específicos liberados para ele e apenas os links/documentos que ele mesmo criou. |

### Regras de Isolamento:
- Um usuário pode pertencer a **um ou mais departamentos**.
- Administradores (`ADMIN`) só enxergam dados de seus respectivos departamentos.
- O `SUPER_ADMIN` (`admin@suaempresa.com.br`) é o único que não pode ser editado ou excluído via sistema.
- A filtragem de dados é aplicada automaticamente no backend com base no JWT do usuário logado.

---

## Fluxo de status de uma submissão

```
pending → docx_generated → document_created → signer_created → sent_to_sign → signed
                                                                             ↘ error (qualquer etapa)
```

---

## Segurança

| Camada | Medida |
|---|---|
| Rate limiting | `@nestjs/throttler`: 100 req/min global; 10/min no login; 5/h no forgot-password |
| Upload de arquivos | Validação de magic bytes (PDF, JPG, PNG) + limite de 20 MB por arquivo |
| JWT | `JWT_SECRET` obrigatório via `getOrThrow` — servidor não inicia se a variável estiver ausente |
| CORS | Restrito à `FRONTEND_URL` definida no `.env` |
| Headers HTTP | `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin` |

---

## Governança e Integridade de Dados

### Soft Delete (Exclusão Lógica)
Para manter o histórico de auditoria e garantir que documentos gerados no passado não percam seu contexto, o sistema utiliza **Soft Delete** em entidades críticas:
- **Departamentos**: Ao desativar um setor, os modelos e usuários vinculados permanecem no banco, mas ficam ocultos em novas operações.
- **Usuários**: Contas desativadas perdem acesso ao sistema imediatamente, mas seu histórico de envios é preservado para relatórios.
- **Modelos**: Modelos excluídos não podem gerar novos links, mas links já enviados continuam funcionando até a expiração.

**Reativação**: O `SUPER_ADMIN` pode reativar qualquer item excluído logicamente através da interface administrativa.
