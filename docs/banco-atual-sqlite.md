# Banco de Dados — Mapeamento Atual (SQLite + Prisma)

> ℹ️ **Levantamento sincronizado com o schema.** Este documento foi reconciliado com
> [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma), que é a **fonte da verdade**.
> Algumas colunas existem no schema mas **ainda não têm migration commitada** (drift via `prisma db push`) —
> veja a nota ⚠️ no [Histórico de Migrations](#histórico-de-migrations). Sempre que houver dúvida,
> consulte o `schema.prisma`.

**Data do levantamento:** 09/06/2026  
**Versão do Prisma:** 6.4.1  
**Banco:** SQLite  
**Arquivo:** `backend/prisma/dev.db`  
**URL:** `DATABASE_URL="file:./dev.db"` (em `backend/.env`)

---

## Visão Geral

O sistema usa **Prisma ORM** com **SQLite** como banco de dados. O schema completo está em `backend/prisma/schema.prisma`. O banco tem **15 tabelas** e passou por **17 migrations** desde a criação em abril de 2026.

---

## Diagrama de Relacionamentos

```
User ──── AuthToken (1:N)   (reset de senha / convite)

Department ─────────────────────────────── User
     │  └── UserDepartment (N:N) ──────────┘
     │
     └── DocumentTemplate ──── UserTemplateAccess (N:N) ── User
              │
              ├── TemplateField
              ├── TemplateAttachment ──── SubmissionAttachment
              ├── TemplateRecipient            (multi-responsável)
              ├── LinkBatch
              │       └── PublicLink ──────────────────── User (createdBy)
              └── PublicLink
                      ├── RecipientSession     (sessão por responsável)
                      └── Submission
                              ├── WebhookEvent
                              └── SubmissionAttachment
```

---

## Tabelas e Campos

### `User`
| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| email | String | unique |
| name | String? | opcional |
| password | String | bcrypt hash |
| role | String | SUPER_ADMIN \| ADMIN \| OPERATOR — default: ADMIN |
| canViewBalance | Boolean | default: false — se pode ver o saldo D4Sign no dashboard |
| deletedAt | DateTime? | soft delete |
| createdAt | DateTime | auto |
| updatedAt | DateTime | auto |

**Relações:** UserDepartment (N:N), UserTemplateAccess (N:N), PublicLink (criados por ele), AuthToken (1:N)

---

### `AuthToken`
| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| token | String | unique — token enviado por e-mail |
| type | String | `RESET` (reset de senha) \| `INVITE` (convite de usuário) |
| email | String | e-mail destinatário |
| userId | String? | FK → User (opcional), cascade delete |
| inviteName | String? | nome pré-preenchido do convidado (apenas INVITE) |
| inviteRole | String? | role pré-definida do convidado (apenas INVITE) |
| inviteDepts | String? | JSON array de departmentIds (apenas INVITE) |
| expiresAt | DateTime | quando o token expira |
| usedAt | DateTime? | quando o token foi consumido |
| createdAt | DateTime | auto |

**Relações:** User (N:1, opcional)

---

### `Department`
| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| name | String | unique |
| safeUuid | String? | UUID do cofre D4Sign vinculado (obrigatório na API; nullable no DB p/ registros legados) |
| safeName | String? | nome do cofre D4Sign (apenas para exibição) |
| deletedAt | DateTime? | soft delete |
| createdAt | DateTime | auto |
| updatedAt | DateTime | auto |

**Relações:** UserDepartment (N:N), DocumentTemplate (1:N)

---

### `UserDepartment` (tabela de junção)
| Campo | Tipo | Observação |
|---|---|---|
| userId | String | FK → User, cascade delete |
| departmentId | String | FK → Department, cascade delete |
| createdAt | DateTime | auto |

**PK composta:** `[userId, departmentId]`

---

### `DocumentTemplate`
| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| name | String | — |
| description | String? | — |
| d4signTemplateId | String? | legado, não usado ativamente |
| localTemplatePath | String? | caminho absoluto do .docx no servidor (modo `template`) |
| basePdfPath | String? | caminho absoluto do PDF base no servidor (modo `overlay`) |
| mode | String | `template` (preenche .docx) \| `overlay` (escreve sobre PDF) — default: template |
| documentType | String | slug gerado a partir do nome |
| departmentId | String? | FK → Department (opcional), onDelete: SET NULL |
| deletedAt | DateTime? | soft delete |
| createdAt | DateTime | auto |
| updatedAt | DateTime | auto |

**Relações:** TemplateField (1:N), TemplateAttachment (1:N), TemplateRecipient (1:N), PublicLink (1:N), LinkBatch (1:N), UserTemplateAccess (N:N)

---

### `TemplateRecipient`
Define os responsáveis (signatários/preenchedores) de um template no fluxo multi-responsável.

| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| templateId | String | FK → DocumentTemplate, cascade delete |
| order | Int | ordem do responsável no fluxo (1, 2, 3…) |
| label | String | ex: `Contratante`, `Testemunha` |
| color | String | cor de identificação na UI — default: `#3B82F6` |
| canSeePreviousAnswers | Boolean | default: false — se vê respostas dos responsáveis anteriores |
| createdAt | DateTime | auto |

**Unique:** `[templateId, order]`

---

### `TemplateField`
| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| templateId | String | FK → DocumentTemplate, cascade delete |
| variableName | String | ex: `CNPJ`, `Q1` (variável no .docx) |
| label | String | ex: `CNPJ da Empresa` |
| fieldType | String | text \| email \| date \| cpf \| cnpj \| phone \| textarea \| select |
| required | Boolean | default: true |
| placeholder | String? | legado, não usado na UI atual |
| options | String? | JSON: `{"choices":["SIM","NÃO"],"weights":[2,0]}` ou `"auto_date"` |
| order | Int | default: 0 |
| recipientOrder | Int? | qual responsável preenche este campo (→ TemplateRecipient.order); null = legado/único |
| createdAt | DateTime | auto |
| updatedAt | DateTime | auto |

---

### `TemplateAttachment`
| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| templateId | String | FK → DocumentTemplate, cascade delete |
| label | String | ex: `RG ou CNH` |
| required | Boolean | default: true |
| order | Int | default: 0 |
| recipientOrder | Int? | qual responsável envia este anexo (→ TemplateRecipient.order); null = legado/único |
| visibleToOrders | String? | JSON array de orders que podem ver este anexo |
| deletedAt | DateTime? | soft delete |
| createdAt | DateTime | auto |

**Relações:** SubmissionAttachment (1:N)

---

### `UserTemplateAccess` (tabela de junção)
| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| userId | String | FK → User, cascade delete |
| templateId | String | FK → DocumentTemplate, cascade delete |
| createdAt | DateTime | auto |

**Unique:** `[userId, templateId]`

---

### `LinkBatch`
| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| name | String | — |
| templateId | String | FK → DocumentTemplate |
| createdAt | DateTime | auto |

**Relações:** PublicLink (1:N)

---

### `PublicLink`
| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| token | String | unique — token de acesso público |
| templateId | String | FK → DocumentTemplate |
| batchId | String? | FK → LinkBatch (opcional) |
| createdById | String? | FK → User (opcional) |
| clientName | String? | — |
| clientEmail | String? | — |
| additionalSigners | String? | JSON com assinantes externos adicionais (além do clientName/Email) |
| internalSigners | String? | JSON com assinantes internos da empresa (usuários do sistema) |
| expiresAt | DateTime | quando o link expira |
| revokedAt | DateTime? | se revogado manualmente |
| accessCount | Int | default: 0 |
| emailSentAt | DateTime? | quando e-mail de notificação foi enviado |
| createdAt | DateTime | auto |
| updatedAt | DateTime | auto |

**Relações:** Submission (1:N), RecipientSession (1:N)

---

### `RecipientSession`
Sessão individual de cada responsável dentro de um link público (fluxo multi-responsável). Cada responsável recebe seu próprio token e preenche sua parte do formulário em sequência.

| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| linkId | String | FK → PublicLink, cascade delete |
| recipientOrder | Int | ordem do responsável (→ TemplateRecipient.order) |
| email | String? | e-mail do responsável |
| name | String? | nome do responsável |
| token | String | unique — token de acesso desta sessão |
| formData | String? | JSON com as respostas deste responsável |
| status | String | `pending` → `in_progress` → `completed` |
| emailSentAt | DateTime? | quando o e-mail desta sessão foi enviado |
| completedAt | DateTime? | quando o responsável concluiu sua parte |
| createdAt | DateTime | auto |

---

### `Submission`
| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| linkId | String? | FK → PublicLink (opcional) |
| formData | String | JSON com respostas do formulário |
| documentUUID | String? | ID do documento no D4Sign |
| status | String | `pending` → `docx_generated` → `document_created` → `signer_created` → `sent_to_sign` → `signed` (ou `error`) |
| generatedPath | String? | caminho absoluto do .docx gerado |
| generatedURL | String? | URL pública para download |
| dimensionsJson | String? | metadados de posicionamento de assinatura |
| lastError | String? | mensagem de erro quando status=error |
| createdAt | DateTime | auto |
| updatedAt | DateTime | auto |

**Relações:** WebhookEvent (1:N), SubmissionAttachment (1:N)

---

### `SubmissionAttachment`
| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| submissionId | String | FK → Submission, cascade delete |
| templateAttachmentId | String | FK → TemplateAttachment |
| filename | String | nome salvo no servidor |
| originalName | String | nome original do upload |
| mimeType | String | — |
| createdAt | DateTime | auto |

---

### `WebhookEvent`
| Campo | Tipo | Observação |
|---|---|---|
| id | String (UUID) | PK |
| submissionId | String | FK → Submission |
| eventType | String | ex: `document_signed`, `document_error` |
| payload | String | JSON completo do webhook D4Sign |
| receivedAt | DateTime | auto |

---

## Histórico de Migrations

| # | Data | Nome | O que fez |
|---|---|---|---|
| 1 | 2026-04-14 | `_init` | Schema inicial: User, DocumentTemplate, PublicLink, Submission, WebhookEvent |
| 2 | 2026-04-16 | `add_form_fields` | Adicionou coluna formFields ao DocumentTemplate |
| 3 | 2026-04-16 | `revert_form_fields` | Removeu formFields (reverteu abordagem) |
| 4 | 2026-04-16 | `add_dimensions_json` | Adicionou dimensionsJson à Submission |
| 5 | 2026-04-17 | `add_link_batch` | Criou LinkBatch; adicionou batchId ao PublicLink |
| 6 | 2026-04-17 | `add_email_sent_at` | Adicionou emailSentAt ao PublicLink |
| 7 | 2026-04-22 | `add_template_fields` | Criou tabela TemplateField |
| 8 | 2026-04-22 | `add_user_role` | Adicionou coluna role ao User |
| 9 | 2026-04-22 | `add_soft_delete_and_additional_signers` | Soft delete em DocumentTemplate; additionalSigners em PublicLink |
| 10 | 2026-04-22 | `auth_users_internal_signers` | Criou UserTemplateAccess; internalSigners e createdById no PublicLink |
| 11 | 2026-04-23 | `add_attachments` | Criou TemplateAttachment e SubmissionAttachment |
| 12 | 2026-04-24 | `add_departments_and_superadmin` | Criou Department e UserDepartment; departmentId no DocumentTemplate (onDelete SET NULL); default role → ADMIN |
| 13 | 2026-05-05 | `add_auth_tokens` | Criou tabela AuthToken (reset de senha e convites) |
| 14 | 2026-05-15 | `add_user_soft_delete` | Adicionou coluna `deletedAt` na tabela `User` (soft delete) |
| 15 | 2026-05-15 | `add_overlay_mode` | Adicionou `basePdfPath` e `mode` ao DocumentTemplate (modo overlay sobre PDF) |
| 16 | 2026-05-18 | `add_soft_delete_template_attachment` | Adicionou coluna `deletedAt` ao TemplateAttachment (soft delete) |
| 17 | 2026-05-27 | `add_multi_recipient` | Criou TemplateRecipient e RecipientSession; `recipientOrder` em TemplateField; `recipientOrder` e `visibleToOrders` em TemplateAttachment |

> ⚠️ **Drift schema × migrations.** As colunas `User.canViewBalance`, `Department.safeUuid`,
> `Department.safeName` e `TemplateRecipient.canSeePreviousAnswers` existem no `schema.prisma`
> mas **não têm migration commitada** — provavelmente aplicadas via `prisma db push`. Antes de um
> deploy limpo, gere a migration faltante com `prisma migrate dev` para que o schema e o histórico
> de migrations fiquem consistentes.

---

## Observações sobre o Schema

- **Soft delete** em: User, Department, DocumentTemplate, TemplateAttachment
- **JSON serializado como String** em: `formData`, `options`, `additionalSigners`, `internalSigners`, `inviteDepts`, `visibleToOrders`, `dimensionsJson`, `payload`
- **Caminhos absolutos de arquivo** salvos no banco em: `localTemplatePath` e `basePdfPath` (DocumentTemplate) e `generatedPath` (Submission) — **ponto de atenção na migração**
- **Roles:** SUPER_ADMIN tem visão global; ADMIN gerencia seu departamento; OPERATOR acessa apenas templates autorizados
- **Multi-responsável:** TemplateRecipient define os signatários de um template; campos/anexos apontam para um responsável via `recipientOrder`; em tempo de execução cada responsável recebe uma RecipientSession com token próprio
- **Cofres D4Sign:** cada Department referencia um cofre (`safeUuid`/`safeName`) onde os documentos são arquivados na D4Sign

---

## Análise: SQLite vs PostgreSQL

### Dificuldade de migrar para PostgreSQL

**Nível: BAIXO-MÉDIO** (1–2 dias de trabalho para um dev familiarizado com Prisma)

#### O que precisa mudar

| Item | Esforço | Detalhe |
|---|---|---|
| `schema.prisma` provider | Trivial | Trocar `sqlite` → `postgresql` |
| `DATABASE_URL` | Trivial | Apontar para conexão Postgres |
| Migrations | Baixo | `prisma migrate reset` + `prisma migrate dev` gera tudo novo |
| `migration_lock.toml` | Trivial | Atualizar provider |
| Tipos de coluna | Baixo | Prisma abstrai — UUID, String, DateTime já mapeiam corretamente |
| JSON armazenado como String | Nenhum | Funciona igual; em Postgres poderia usar `Json` nativo, mas não é obrigatório |
| Caminhos de arquivo no banco | Nenhum | São só strings, migram normalmente |
| Backup/deploy | Médio | Precisa provisionar e manter instância Postgres (local ou cloud) |

#### O que **não** precisa mudar
- Todo o código NestJS/backend (queries Prisma são agnósticas de banco)
- Todo o frontend
- Lógica de negócio

#### Riscos
- A única pegadinha real do Prisma SQLite→Postgres é que algumas features de schema que o SQLite ignora (ex: restrições `onDelete` em certas configs) passam a ser aplicadas pelo Postgres — mas este schema já está bem declarado.
- Os dados do `dev.db` atual precisariam ser migrados manualmente se você quiser aproveitar o histórico (via script de dump/import ou `prisma db seed` do zero).

---

### Vale a pena ficar no SQLite?

**Depende do cenário de uso. Veja a análise:**

#### Pontos POSITIVOS do SQLite para este sistema
- **Zero infraestrutura:** banco é um arquivo, sem servidor, sem configuração de rede
- **Deploy simples:** funciona em qualquer VPS/container sem dependência externa
- **Backups triviais:** basta copiar o arquivo `dev.db`
- **Carga atual é leve:** o fluxo é cadastro de templates → geração de links → assinatura. Raramente há concorrência alta simultânea

#### Pontos de ATENÇÃO com SQLite em produção

| Risco | Impacto | Mitigação |
|---|---|---|
| **Writes concorrentes** | Alto | SQLite bloqueia a tabela inteira em writes. Se vários clientes assinarem ao mesmo tempo, pode haver lock contention | Usar WAL mode (`PRAGMA journal_mode=WAL`) reduz muito, mas não elimina |
| **Sem conexão remota nativa** | Médio | O banco fica preso no servidor da aplicação — sem acesso de outras ferramentas de BI/análise diretamente | Pode usar ferramentas como Datasette ou exportar CSV |
| **Arquivo em disco = risco de corrupção** | Médio | Em crash sem WAL, pode corromper dados | Usar WAL + backups automáticos diários |
| **Sem suporte a múltiplas instâncias** | Alto | Se você escalar horizontalmente (2+ instâncias da API), cada uma leria um banco diferente | Irrelevante se rodar em instância única |
| **Limite de escala** | Baixo/Médio | Para uso interno de uma empresa com dezenas de submissões/dia, é absolutamente suficiente. Para milhares/dia, começaria a sentir |

#### Recomendação

**Para uso interno corporativo com volume moderado (até ~500 submissões/dia), SQLite com WAL mode habilitado é perfeitamente aceitável** e tem custo operacional praticamente zero.

**Migre para PostgreSQL se:**
- Precisar de múltiplas instâncias da API rodando em paralelo (load balancing)
- Quiser conectar ferramentas de BI/relatório diretamente no banco
- O volume crescer para milhares de submissões simultâneas por dia
- Precisar de recursos avançados como full-text search nativo, JSON queries, particionamento

**Se ficar no SQLite, faça isso agora:**
```sql
-- Habilitar WAL mode (rodar uma vez no banco)
PRAGMA journal_mode=WAL;
```

E configure backup automático diário do arquivo `dev.db`.
