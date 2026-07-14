# Documentos

**Rota:** `/admin/documents`  
**Acesso:** ADMIN e OPERATOR (dados filtrados por perfil — ver backend)

---

## Funcionamento

Lista todas as submissões (formulários preenchidos) e permite acompanhar o status de cada documento enviado ao D4Sign.

### Isolamento por Departamento
- Assim como nas outras telas, a visibilidade dos documentos é restrita aos departamentos vinculados ao usuário.
- O cabeçalho inclui o **Seletor de Departamentos** (disponível para `SUPER_ADMIN` ou `ADMIN` com mais de um departamento).
- A filtragem ocorre no backend via parâmetro `departmentIds` no endpoint `GET /links/submissions/all`.
- OPERATORs continuam vendo apenas os documentos gerados a partir de seus próprios links.

---

## Frontend

**Arquivo:** `frontend/src/app/admin/documents/page.tsx`

### Filtros
- **Busca:** filtra por empresa (`COMPANY_LEGAL_NAME` do formData), nome do cliente ou e-mail
- **Seletor de Departamentos:** permite filtrar documentos por área (respeitando as permissões do usuário)
- **Status (Dropdown):** lista suspensa compacta para filtrar por status (Pendente / DOCX Gerado / Enviado / Signatário Adicionado / Aguardando Assinatura / Assinado / Erro)

### Tabela
Colunas: empresa, documento (nome do modelo + UUID parcial), status, data, ações.

**Status labels:**

| Código | Label |
|---|---|
| `pending` | Pendente |
| `docx_generated` | DOCX Gerado |
| `document_created` | Enviado |
| `signer_created` | Signatário Adicionado |
| `sent_to_sign` | Aguardando Assinatura |
| `signed` | Assinado |
| `error` | Erro |

- Em caso de `error`, exibe a mensagem de `lastError` abaixo do badge (truncada)
- Botão de ação (hover): link externo para o documento no painel D4Sign (`{NEXT_PUBLIC_D4SIGN_DESK_URL}/desk/viewblob/{documentUUID}` — produção por padrão) quando o UUID estiver disponível

### Atualização
- Botão **Atualizar** no cabeçalho recarrega manualmente os dados (chama `GET /links/submissions/all` novamente)
- Não há polling automático (ao contrário do Dashboard que atualiza a cada 30 s)

---

## Backend

**Endpoint:** `GET /links/submissions/all`  
**Arquivo:** `src/links/links.controller.ts` + `src/links/links.service.ts`

- Retorna todas as `Submission` com join em `link` (token, clientName, clientEmail, template.name)
- Filtro por `createdById` aplicado via join quando o usuário for OPERATOR

---

## Banco de dados envolvido

- `Submission` — todos os campos, mais join via `link.createdById` para isolamento OPERATOR
- `PublicLink` — token, clientName, clientEmail, createdById
- `DocumentTemplate` — name
