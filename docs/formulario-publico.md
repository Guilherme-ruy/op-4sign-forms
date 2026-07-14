# Formulário Público

**Rota:** `/public/[token]`  
**Acesso:** público (sem autenticação — rota fora do layout `/admin`)

---

## Funcionamento

Página acessada pelo cliente a partir do link de envio recebido por e-mail. O cliente preenche o formulário, anexa os documentos exigidos, revisa o documento gerado e confirma o envio. O sistema então gera o DOCX/PDF, faz upload ao D4Sign e adiciona os signatários.

---

## Frontend

**Arquivo:** `frontend/src/app/public/[token]/page.tsx`

### Fluxo em steps

Os passos são determinados dinamicamente com base na configuração do modelo:

```
Passo 0 — Campos regulares
Passo N — E-mail para assinatura    (apenas se existir campo CLIENT_EMAIL)
Passo N — Documentos                (apenas se o modelo tiver slots de anexo)
Passo final — Revisão e confirmação
```

**Exemplos:**
- Sem e-mail, sem anexos: **2 passos** (campos → revisão)
- Com e-mail, sem anexos: **3 passos** (campos → e-mail → revisão)
- Sem e-mail, com anexos: **3 passos** (campos → documentos → revisão)
- Com e-mail e anexos: **4 passos** (campos → e-mail → documentos → revisão)

Uma barra de progresso animada indica o avanço entre os passos.

### Passo: Campos do formulário
- Campos gerados dinamicamente a partir de `GET /templates/:id/fields` (`@Public()`)
- Cada campo usa o componente `DynamicField` com máscara e tipo adequados

**Tipos e comportamentos:**

| Tipo | Comportamento |
|---|---|
| `text` | Texto livre |
| `email` | Input type=email (validação nativa) |
| `date` | Máscara `DD/MM/AAAA`; toggle "Data atual" preenche com hoje e trava o campo |
| `cpf` | Máscara `000.000.000-00`, inputMode=numeric |
| `cnpj` | Máscara `00.000.000/0000-00`, inputMode=numeric |
| `phone` | Máscara `(00) 00000-0000`, inputMode=numeric |
| `textarea` | Área de texto sem máscara |

**Data automática:** se `field.options === "auto_date"`, o campo é pré-preenchido com a data do dia ao carregar o formulário e o toggle "Data atual" já aparece marcado. O cliente pode desmarcar para digitar manualmente.

### Passo: E-mail para assinatura
- Exibido apenas se o modelo tiver o campo `CLIENT_EMAIL`
- Input de e-mail simples, obrigatório para avançar

### Passo: Documentos
- Exibido apenas se o modelo tiver slots de anexo configurados (`GET /templates/:id/attachments`)
- Cada slot aparece como um card com:
  - Nome do documento + badge **Obrigatório** / **Opcional**
  - Botão "Anexar Documento" (abre seletor de arquivo — no mobile abre câmera ou galeria)
  - Aceita: `image/*`, `application/pdf`
  - Após upload: mostra nome do arquivo + ícone de tipo + botão de remover
- Upload imediato via `POST /links/:token/attachment/:attachmentId` (multipart)
- Remoção via `DELETE /links/:token/attachment/:attachmentId`
- Slots obrigatórios sem arquivo bloqueiam o botão "Ver Documento"

### Passo revisão: preview do documento
- O sistema chama `POST /links/:token/preview` com o `formData` atual
- Se o servidor retornar um PDF, exibe via `<iframe>`
- Se retornar DOCX (preview inline indisponível), exibe botão para download
- O cliente deve marcar o checkbox "Li e confirmo..." antes de enviar

### Envio
Ao clicar em **Confirmar e Enviar**:
1. Overlay animado com 4 etapas visuais ("Verificando informações", "Preparando documento", "Processando", "Concluindo")
2. Chamada `POST /links/:token/submit` em paralelo com a animação (duração total ~4,4 s)
3. O backend move os arquivos pendentes de `data/pending-attachments/{token}/` para `data/attachments/{submissionId}/` e cria os registros `SubmissionAttachment`
4. Em caso de sucesso: tela de confirmação com mensagem de sucesso
5. Em caso de erro: exibe mensagem e permite tentar novamente

### Estados especiais
- **Link já utilizado (409):** mostra tela "Aguardando Assinatura" ou "Documento Assinado" dependendo do `submissionStatus` retornado
- **Link inválido/expirado:** tela de erro com botão "Tentar Novamente"
- **Carregando:** spinner animado enquanto busca dados do link, campos e slots de anexo

---

## Backend — Endpoints públicos

Todos marcados com `@Public()` — não requerem JWT.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/links/:token` | Valida o link (expiração, revogação, uso anterior) e retorna dados do template |
| `GET` | `/templates/:id/fields` | Lista campos do formulário do modelo |
| `GET` | `/templates/:id/attachments` | Lista slots de anexo do modelo |
| `POST` | `/links/:token/preview` | Gera DOCX preenchido e converte para PDF se possível; retorna `{ filename, isPdf }` |
| `POST` | `/links/:token/attachment/:attachmentId` | Upload de arquivo para um slot; salva em `data/pending-attachments/{token}/` |
| `DELETE` | `/links/:token/attachment/:attachmentId` | Remove arquivo pendente de um slot |
| `POST` | `/links/:token/submit` | Submete o formulário; move anexos para `data/attachments/{submissionId}/`; dispara geração do documento e envio ao D4Sign assincronamente |
| `GET` | `/links/preview-file/:filename` | Serve o arquivo de preview gerado localmente |

### `GET /links/:token`
- Verifica se `revokedAt` é nulo e `expiresAt > now()`
- Verifica se já existe submissão: se sim, retorna `409` com `{ submissionStatus }`
- Incrementa `accessCount` no link

### `POST /links/:token/submit`
Cria um registro `Submission` com `status = "pending"`, move os anexos pendentes e dispara o processamento em background:
```
pending → docx_generated → document_created → signer_created → sent_to_sign
                                                                          ↘ error
```

### Armazenamento de anexos
- **Pendentes:** `data/pending-attachments/{token}/{attachmentId}-{timestamp}.ext`
- **Definitivos:** `data/attachments/{submissionId}/{attachmentId}-{timestamp}.ext`
- Servidos via `GET /links/attachment-file/:submissionId/:filename` (protegido, JWT)

---

## Banco de dados envolvido

- `PublicLink` — validação (expiração, revogação), `accessCount`, `clientEmail`, `additionalSigners`, `internalSigners`
- `DocumentTemplate` + `TemplateField` — campos do formulário
- `TemplateAttachment` — slots de anexo exigidos pelo modelo
- `Submission` — registro da submissão e rastreamento de status
- `SubmissionAttachment` — arquivos enviados pelo cliente associados à submissão
