# Modelos de Documento

**Rota:** `/admin/templates`  
**Acesso:** ADMIN (acesso total) | OPERATOR (vê apenas modelos liberados pelo admin)

---

## Funcionamento

Gerencia os modelos de documentos usados para geração de contratos, formulários e acordos. O sistema oferece **dois modos de criação**:

1. **Modelo DOCX (`template`)**: Focado em documentos de texto dinâmicos. O administrador envia um arquivo Word `.docx` contendo variáveis `{{VARIAVEL}}`. O sistema detecta os campos automaticamente e substitui as informações durante a geração.
2. **Formulário PDF Fixo (`overlay`)**: Focado em layouts estáticos (como guias e fichas de parceiros). O administrador envia um `.pdf` base e desenha visualmente "caixas" de texto sobre o documento para capturar os dados do cliente nas coordenadas exatas.

Cada modelo define:
- O arquivo base (DOCX ou PDF)
- Os campos do formulário que o cliente vai preencher (extraídos do DOCX ou mapeados no PDF)
- O tipo de cada campo (texto, CNPJ, data, seleção, checkbox, etc.)
- Os documentos exigidos em anexo (ex: RG, comprovante de endereço)

---

## Frontend

### Página de listagem — `frontend/src/app/admin/templates/page.tsx`

#### Lista de modelos (cards)
Cada card exibe:
- Nome e descrição do modelo
- Badges de modo e status: **PDF Overlay** (roxo) ou **DOCX** (verde), com alerta visual amarelo caso o arquivo base esteja pendente.
- Badge do **Departamento** vinculado
- Contagem de campos configurados
- Botão **Upload / Substituir** — para selecionar `.docx` ou `.pdf`, dependendo do modo
- **Ações para DOCX**: Botões de **Download**, **Preview** e **Editor** (Configuração lógica)
- **Ações para PDF Fixo**: Botão para abrir o **Editor Visual de Campos**
- Botões de edição e exclusão (visíveis no hover)

#### Filtro de Departamentos
No cabeçalho da página, o `DepartmentSelector` filtra os modelos por setor em tempo real. Nos modais de criação e edição, a seleção respeita as permissões do usuário (Super Admin vê todos; Admin/Operator vê apenas seus setores vinculados).

#### Modal: Novo Modelo
O fluxo possui duas etapas:
1. **Escolha do Modo:** "Modelo DOCX" ou "Formulário PDF Fixo".
2. **Dados Básicos:** **Nome** (obrigatório), **Descrição** e **Departamento** (obrigatório).

> `documentType` é gerado automaticamente como slug do nome. O campo `mode` define o comportamento (`template` ou `overlay`).

> **Departamento é obrigatório** (validado no backend em `POST`/`PATCH /templates`). O cofre D4Sign de destino dos documentos vem do departamento do modelo — um modelo sem departamento (ou cujo departamento não tenha cofre) **falha na geração** com mensagem clara. Admin/Operator só escolhem entre os departamentos aos quais têm acesso.

#### Modal: Editar Modelo
- Permite editar **Nome**, **Descrição** e alterar o **Departamento** (obrigatório) do modelo.
- Salva via `PATCH /templates/:id`

#### Modal: Excluir Modelo
- Requer digitação de **"sim"** para confirmar
- Realiza **soft delete**: o registro permanece no banco (preserva histórico de links e submissões), o arquivo DOCX local é removido e `deletedAt` é preenchido
- Modelos excluídos não aparecem na lista, mas links existentes ainda referenciam o modelo (identificados com badge "excluído" na página de Links)

---

### Página de Configuração (Modelo DOCX) — `frontend/src/app/admin/templates/[id]/page.tsx`

Rota dedicada para configurar campos e documentos exigidos de um modelo.  
Acesso via botão ⚙ no card do modelo ou diretamente por URL.

#### Layout
- **Header**: seta de voltar + nome do modelo (sem botões de ação)
- **Barra de ações fixa no rodapé** (`fixed bottom-0 left-64 right-0`): exibe contador contextual de campos/documentos configurados + botões **Cancelar** e **Salvar Alterações** — acompanha o scroll da página
- **`pb-24`** no wrapper garante que o último card não fique oculto atrás da barra

#### Aba "Campos do Formulário"

Lista todos os campos detectados no DOCX pelo algoritmo de extração. Para cada campo:

| Elemento | Descrição |
|---|---|
| Variável no DOCX | Exibição somente leitura: `{{ NOME_VARIAVEL }}` |
| Tipo | Select com todos os tipos disponíveis |
| Obrigatório | Toggle dentro da mesma linha do tipo |
| Label | Input de texto — pergunta exibida ao cliente no formulário |
| Opções (select) | Editor de opções + pesos (veja abaixo) |
| Data automática (date) | Toggle inline que pré-preenche com data atual |

> Campos não podem ser removidos manualmente — eles espelham as variáveis do DOCX. Para remover um campo, atualize o DOCX sem aquela variável e clique em **Substituir DOCX**.

**Botão "Substituir DOCX"** (rodapé da aba Campos): abre o seletor de arquivo `.docx`, faz o upload imediato e atualiza a lista de campos sem recarregar a página.

**Tipos de campo disponíveis:**
- `text` — texto livre
- `email` — e-mail (validação nativa do browser)
- `date` — data com máscara `DD/MM/AAAA` + opção de data automática
- `cpf` — máscara `000.000.000-00`
- `cnpj` — máscara `00.000.000/0000-00`
- `phone` — máscara `(00) 00000-0000`
- `textarea` — texto longo (múltiplas linhas)
- `select` — seleção única (radio buttons) com opções configuráveis + pesos opcionais

#### Tipo `select` — Editor de opções

Ao selecionar tipo `select`, um painel expandido aparece abaixo do campo com:

- Lista de opções de resposta (texto livre por opção)
- Toggle **"Usar pontuação/pesos"**: quando ativado, exibe um input numérico de peso ao lado de cada opção
- Botão para adicionar/remover opções

**Serialização no banco** (`options` JSON):
```json
{ "choices": ["SIM", "AP", "NÃO"], "weights": [2, 1, 0] }
```
Se não usar pesos, `weights` é omitido:
```json
{ "choices": ["SIM", "NÃO"] }
```

**No formulário público**: o cliente vê as opções como radio button cards visuais — nunca vê pesos ou pontuações. Caso haja opções salvas como em branco/vazias, o formulário aplica um filtro dinâmico que impede a renderização de botões fantasmas.

**Na geração do documento**: o campo `{{Q1}}` recebe o valor selecionado diretamente ("SIM", "AP", "NÃO"). Adicionalmente, são geradas variáveis por opção:
- `{{Q1_SIM}}` → `"X"` se selecionado, `""` caso contrário
- `{{Q1_AP}}` → idem
- `{{Q1_NAO}}` → idem (acentos removidos via NFD normalize)

Se houver pesos configurados, também são geradas:
- `{{TOTAL_PONTOS}}` → soma dos pontos
- `{{PONTUACAO_PERCENTUAL}}` → percentual sobre o máximo possível (ex: `"75%"`)

**Na área admin** (modal "Detalhes da Submissão"): exibe resposta de cada campo de seleção com badge colorido e pontuação `pts/max`. Rodapé com barra de progresso e percentual total — visível apenas para o administrador.

#### Aba "Documentos Exigidos"
Define quais arquivos o cliente deverá anexar antes de enviar o formulário. Para cada slot:
- **Nome do Documento** (ex: "RG ou CNH", "Comprovante de Endereço")
- **Obrigatório** — toggle que bloqueia o envio caso o cliente não anexe
- Botão de remoção do slot

O admin pode adicionar quantos slots quiser. Salva via `PUT /templates/:id/attachments`.

---

### Editor Visual (Formulário PDF Fixo) — `frontend/src/app/admin/templates/[id]/overlay/page.tsx`

Rota dedicada para configurar visualmente os campos de templates do tipo `overlay`.  
O PDF base é renderizado em um canvas através da biblioteca `pdfjs-dist`.

#### Funcionamento do Canvas
- O administrador clica em **Adicionar Campo** e, em seguida, em qualquer área do PDF para inserir uma nova "caixa" de campo.
- É possível **arrastar para mover** a caixa pelo documento ou arrastar o canto inferior direito para **redimensionar**.
- O frontend converte dinamicamente o posicionamento do mouse em coordenadas relativas percentuais (`x`, `y`, `width`, `height` entre 0 e 1). Isso garante que o texto final seja inserido corretamente, independentemente da escala de renderização da tela do usuário.

#### Configuração de Campos
No painel lateral (ativo quando um campo está selecionado), é possível configurar:
- **Enumeração Sequencial:** Todos os campos listados no painel lateral são numerados sequencialmente (`1.`, `2.`, etc.) para facilitar a identificação.
- **Variável no documento e Label:** Nomes de referência e exibição.
- **Tipo:** Texto, Data, CPF, CNPJ, E-mail, Telefone ou Checkbox.
- **Tamanho da Fonte:** Define a escala da fonte (em `pt`) impressa no PDF final.
- **Agrupamento de Checkboxes (grpMeta):** Para o tipo `checkbox`, é possível criar grupos de seleção mútua (estilo radio button) ou com limite de seleções.
  - **Pergunta do Grupo:** Define o título da pergunta que engloba as opções.
  - **Máx. Seleções:** Dropdown dinâmico (com base no total de itens do grupo) para limitar quantas opções o usuário pode marcar.
  - **Pontuação:** Permite atribuir uma pontuação para cada opção selecionada.
- **Valor de Marcação (Legado):** Mantido para compatibilidade com rádio buttons antigos onde várias checkboxes compartilham a mesma `variableName`.

As alterações são salvas num array de campos submetido via `PUT /templates/:id/fields`.

---

## Backend

**Controller:** `src/templates/templates.controller.ts`  
**Service:** `src/templates/templates.service.ts`

### Endpoints

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/templates` | protegido | Lista modelos (filtra por departamento para não-SUPER_ADMIN) |
| `POST` | `/templates` | protegido | Cria novo modelo |
| `PATCH` | `/templates/:id` | protegido | Atualiza nome/descrição/departamento |
| `DELETE` | `/templates/:id` | protegido | Soft delete + remove DOCX local |
| `POST` | `/templates/:id/upload-docx` | protegido | Upload do arquivo `.docx` via multipart; re-detecta variáveis e sincroniza campos |
| `POST` | `/templates/:id/upload-base-pdf` | protegido | Upload do arquivo `.pdf` base para formulários overlay |
| `GET` | `/templates/:id/download-docx` | protegido | Download do DOCX salvo no servidor (blob com JWT) |
| `GET` | `/templates/:id/base-pdf` | `@Public()` | Serve o PDF base para renderizar o Canvas no Frontend |
| `GET` | `/templates/:id/fields` | `@Public()` | Lista campos do modelo |
| `PUT` | `/templates/:id/fields` | protegido | Salva/substitui todos os campos (usado pela tela de Configuração e Editor Visual) |
| `GET` | `/templates/:id/attachments` | `@Public()` | Lista slots de anexo do modelo |
| `PUT` | `/templates/:id/attachments` | protegido | Salva/substitui todos os slots de anexo |

> O endpoint `POST /templates/:id/rescan` ainda existe no controller mas não é mais exposto na UI — o fluxo recomendado é substituir o DOCX via `upload-docx`, que já faz a sincronização automaticamente.

### Upload do DOCX (`POST /templates/:id/upload-docx`)
1. Aceita arquivo `.docx` em memória (multer `memoryStorage`)
2. Salva em `backend/templates/{id}.docx`
3. Extrai variáveis `{{NOME}}` do XML interno do DOCX:
   - Analisa `word/document.xml`, headers e footers
   - Strip de tags XML antes de aplicar o regex
   - **Tolera espaços** dentro dos delimitadores: `{{Q1 }}` é detectado igual a `{{Q1}}` (regex `\{\{([A-Z][A-Z0-9_]*)\s*\}\}`)
   - Lida com variáveis divididas em múltiplos runs XML (comportamento padrão do Word)
4. Sincroniza os campos no banco:
   - Remove campos de variáveis que não existem mais no novo DOCX
   - Cria novos campos para variáveis recém-detectadas
   - **Mantém** configurações (label, tipo, opções, pesos) de campos já existentes
5. Auto-detecta o tipo inicial pelo nome da variável:
   - Contém `email` → `email`
   - Contém `date` ou `data` → `date`
   - Contém `cnpj` → `cnpj`
   - Contém `cpf` → `cpf`
   - Contém `phone`, `telefone`, `fone` → `phone`
   - Demais → `text`

### Geração de documentos (`DocgenService`)

O `Docxtemplater` usa um **parser customizado com trim** (`trimParser`) que remove espaços do nome da tag antes de buscar no `formData`. Isso garante que `{{Q1 }}` no DOCX substitui corretamente a variável `Q1` — sem precisar corrigir o arquivo Word.

```typescript
function trimParser(tag: string) {
  const key = tag.trim();
  return { get(scope) { return key in scope ? scope[key] : ''; } };
}
```

### Expansão de campos `select` (`expandFormData`)

Chamado antes de cada geração de documento (preview e submissão real). Para cada campo do tipo `select`:
1. Gera variáveis booleanas por opção (ex: `Q1_SIM`, `Q1_AP`, `Q1_NAO`)
   - Acentos removidos via NFD normalize (ex: `NÃO` → `NAO`)
2. Se houver pesos, calcula `TOTAL_PONTOS` e `PONTUACAO_PERCENTUAL`

---

## Banco de dados

### `DocumentTemplate`
```
id                String   (UUID)
name              String
description       String?
documentType      String   (slug gerado automaticamente do nome)
departmentId      String?  (FK → Department; nullable no DB, mas obrigatório na API — registros legados podem estar sem)
mode              String?  (null/"template" para DOCX, "overlay" para PDF Fixo)
localTemplatePath String?  (caminho absoluto do DOCX no servidor)
basePdfPath       String?  (caminho absoluto do PDF no servidor para overlays)
d4signTemplateId  String?  (legado, não utilizado ativamente)
deletedAt         DateTime? (soft delete)
createdAt / updatedAt
```

### `TemplateField`
```
id           String
templateId   String   (FK → DocumentTemplate)
variableName String   (ex: "CNPJ", "CAMPO_1")
label        String   (ex: "CNPJ da Empresa")
fieldType    String   (text | email | date | cpf | cnpj | phone | textarea | select | checkbox)
required     Boolean
options      String?  (JSON DOCX: {"choices":["SIM"],"weights":[2]} | JSON PDF: {"overlay":{"page":1,"x":0.1,"y":0.1,"width":0.18,"height":0.025,"fontSize":11},"group":{"id":"grp_abc","question":"AFE","maxSelections":1,"score":10}})
order        Int
```

### `TemplateAttachment`
```
id         String   (UUID)
templateId String   (FK → DocumentTemplate, cascade delete)
label      String   (ex: "RG ou CNH")
required   Boolean  (bloqueia envio se não anexado)
order      Int
createdAt  DateTime
```
