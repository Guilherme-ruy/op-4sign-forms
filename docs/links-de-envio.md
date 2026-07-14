# Links de Envio

**Rota:** `/admin/links`  
**Acesso:** ADMIN (vê todos) | OPERATOR (vê somente os links que criou)

---

## Funcionamento

Central de geração e gestão de links de preenchimento. Cada link é uma URL única enviada a um cliente para que ele preencha o formulário e assine o documento. Ao ser gerado, o link pode ser enviado automaticamente por e-mail.

---

## Isolamento e Departamentos

A visibilidade dos links segue o modelo de isolamento por área:
- **SUPER_ADMIN**: Vê todos os links de todos os departamentos e possui o **Seletor de Departamentos** para filtrar a lista.
- **ADMIN**: Vê todos os links dos departamentos aos quais está vinculado. Se estiver em mais de um, o seletor é exibido.
- **OPERATOR**: Vê apenas os links que ele mesmo criou (criador = usuário logado).

A filtragem técnica ocorre no endpoint `GET /links` via query parameter `departmentIds[]`.

### Tabs e filtros
- **Tabs:** Todos / Individual / Em Lote
- **Busca:** filtra por nome do cliente, e-mail, nome do lote ou modelo
- **Status (Dropdown):** Todos / Ativo / Expirado / Revogado
- **Filtro por modelo** e **filtro por lote**
- **Toggle "Modelo excluído":** exibe/oculta links cujo modelo foi soft-deletado

### Tabela de links
Colunas: seleção, cliente (nome + e-mail), modelo, lote, validade, acessos, e-mail (enviado/pendente), status do link, status do documento, ações.

**Status do link:**
- `Ativo` — não revogado e não expirado
- `Expirado` — data de validade ultrapassada
- `Revogado` — manualmente desativado

**Status do documento** (última submissão):

| Código | Label |
|---|---|
| `pending` | Pendente |
| `docx_generated` | Gerando |
| `document_created` | Enviado |
| `signer_created` | Configurando |
| `sent_to_sign` | Aguardando |
| `signed` | Assinado |
| `error` | Erro |

**Ações por linha (hover):**
- Copiar URL do link
- Abrir formulário público
- **Ver detalhes da submissão** — abre modal listando todas as respostas do formulário, questões de avaliação e a data/hora exata em que foi **Preenchido em**.
- **Ver documentos enviados** — abre modal listando os arquivos anexados pelo cliente, com link para visualização/download.
- Abrir documento no D4Sign (quando enviado/assinado)
- Revogar (somente links Ativos)

### Seleção em massa
- Checkboxes selecionam somente links **Ativos**
- Barra flutuante aparece ao selecionar um ou mais
- Botão **Revogar Selecionados** abre modal de confirmação

### Paginação
- 20 links por página
- Navegação com botões anterior/próximo e páginas numeradas

---

## Modal: Novo Link Individual

Campos do formulário:
- **Modelo de Documento** (obrigatório) — select com modelos disponíveis; aviso se sem DOCX
- **Nome do Cliente** (opcional)
- **Validade (dias)** (padrão: 30)
- **E-mails Signatários** — o 1º e-mail (campo primário) recebe o link por e-mail e assina à direita no D4Sign; e-mails adicionais podem ser inseridos com botão "+Adicionar signatário"
- **Signatários Internos** — e-mails internos que assinarão o documento; substitui o valor padrão do `.env` (`D4SIGN_INTERNAL_SIGNER_EMAIL`); insere-se com botão "+Adicionar interno"

### Posicionamento de pins (assinatura no D4Sign)
- **Cliente (primário):** posição à direita (~580px)
- **Adicionais:** distribuídos entre o signatário interno mais à direita e o cliente
- **Internos:** distribuídos a partir da esquerda (~69px), espaçados ~70px entre si
- Páginas intermediárias: tipo rúbrica (type=1) | Última página: assinatura (type=0)
- Coordenadas escalam proporcionalmente às dimensões reais do documento (obtidas da API D4Sign)

---

## Modal: Envio em Massa

1. Define nome do lote, validade e modelo
2. Faz upload de CSV com colunas: `nome_cliente`, `email`, `dias_validade` (opcional)
3. Preview da tabela com validação de e-mail por linha
4. Gera todos os links de uma vez; cada um recebe e-mail automático se e-mail for válido

---

## Modais de confirmação

- **Revogar link individual:** confirma com 1 clique (sem digitar texto)
- **Revogar em massa:** confirma com 1 clique, exibe contagem
- Os links são marcados com `revokedAt = now()` e ficam inativos imediatamente

---

## Backend

**Controller:** `src/links/links.controller.ts`  
**Service:** `src/links/links.service.ts`

### Endpoints protegidos (JWT obrigatório)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/links` | Lista links paginados (filtrado por `createdById` para OPERATOR) |
| `POST` | `/links` | Cria link individual |
| `GET` | `/links/batches` | Lista lotes |
| `POST` | `/links/batch` | Cria lote (CSV) |
| `GET` | `/links/submissions/all` | Lista todas as submissões |
| `GET` | `/links/submissions/:submissionId/attachments` | Lista arquivos enviados pelo cliente em uma submissão |
| `GET` | `/links/attachment-file/:submissionId/:filename` | Serve o arquivo de anexo da submissão |
| `DELETE` | `/links/:token/revoke` | Revoga link (OPERATOR: somente os próprios) |
| `POST` | `/links/bulk-revoke` | Revoga múltiplos por array de tokens |

### Endpoints públicos (`@Public()` — sem JWT)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/links/:token` | Retorna dados do link (valida expiração e uso) |
| `POST` | `/links/:token/preview` | Gera preview do documento preenchido |
| `POST` | `/links/:token/submit` | Submete o formulário e move anexos pendentes |
| `GET` | `/links/preview-file/:filename` | Serve o arquivo de preview gerado |
| `POST` | `/links/:token/attachment/:attachmentId` | Upload de documento do cliente (multipart) |
| `DELETE` | `/links/:token/attachment/:attachmentId` | Remove documento pendente de um slot |

### Isolamento por usuário (OPERATOR)
- `listLinks()` adiciona `where: { createdById: user.sub }` se role for OPERATOR
- `revokeLink()` verifica se `link.createdById === user.sub` antes de revogar
- `bulkRevokeLinks()` adiciona `createdById` no filtro `updateMany`

---

## Banco de dados

### `PublicLink`
```
id                String    (UUID)
token             String    (UUID único — compõe a URL pública)
templateId        String    (FK → DocumentTemplate)
batchId           String?   (FK → LinkBatch, se gerado em massa)
createdById       String?   (FK → User, quem criou o link)
clientName        String?
clientEmail       String?   (signatário primário — recebe e-mail e pin à direita)
additionalSigners String?   (JSON: array de e-mails signatários adicionais)
internalSigners   String?   (JSON: array de e-mails internos — sobrescreve .env)
expiresAt         DateTime
revokedAt         DateTime? (null = ativo)
accessCount       Int       (quantas vezes o cliente abriu o link)
emailSentAt       DateTime? (quando o e-mail de convite foi enviado)
createdAt / updatedAt
```

### `LinkBatch`
```
id         String  (UUID)
name       String  (nome do lote)
templateId String  (FK → DocumentTemplate)
createdAt  DateTime
```

### `Submission`
```
id             String
linkId         String?   (FK → PublicLink)
formData       String    (JSON com os campos preenchidos)
documentUUID   String?   (UUID do documento no D4Sign)
status         String    (ver fluxo abaixo)
generatedPath  String?   (caminho do DOCX/PDF gerado localmente)
lastError      String?   (mensagem de erro da última falha)
createdAt / updatedAt
```

### `SubmissionAttachment`
```
id                   String   (UUID)
submissionId         String   (FK → Submission, cascade delete)
templateAttachmentId String   (FK → TemplateAttachment)
filename             String   (nome do arquivo em disco)
originalName         String   (nome original do arquivo)
mimeType             String
createdAt            DateTime
```

Armazenado em: `data/attachments/{submissionId}/{filename}`

### Fluxo de status
```
pending → docx_generated → document_created → signer_created → sent_to_sign → signed
                                                                             ↘ error
```
