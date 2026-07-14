# Rotas da API e Endpoints

A API é construída com NestJS e utiliza prefixos globais e guards de autenticação JWT.

## Autenticação
- `POST /auth/login`: Realiza login e retorna o JWT (válido por 8h). **Rate limit: 10 req/min por IP.**
- `GET /auth/me`: Retorna dados do usuário autenticado.
- `POST /auth/forgot-password`: Envia e-mail com link de redefinição de senha. **Rate limit: 5 req/hora por IP.**
- `POST /auth/reset-password`: Redefine a senha usando token do e-mail.
- `POST /auth/invite`: (SUPER_ADMIN) Envia convite por e-mail para novo usuário.
- `POST /auth/accept-invite`: Cria conta a partir do token de convite.
- `GET /auth/validate-token/:token`: Valida se um token de convite ou reset ainda é válido (retorna tipo e e-mail).

## Dashboard & Relatórios
- `GET /dashboard/stats`: Resumo de atividades para os cards superiores.
- `GET /reports/stats`: Funil de conversão e métricas por modelo.
- `GET /reports/items`: Listagem detalhada para exportação CSV.
- `GET /reports/submissions`: Submissões filtradas para o gráfico principal.

## Usuários (SUPER_ADMIN)
- `GET /users`: Lista todos os usuários.
- `POST /users`: Cria novo usuário (vincula departamentos).
- `PATCH /users/:id`: Edita usuário (inclui a flag `canViewBalance`).
- `DELETE /users/:id`: Soft delete de usuário.
- `POST /users/:id/reactivate`: Restaura usuário excluído.

## Departamentos
- `GET /departments`: Lista departamentos ativos (qualquer autenticado).
- `POST /departments` (SUPER_ADMIN): Cria departamento — exige `name` **e** `safeUuid` (cofre D4Sign).
- `PATCH /departments/:id` (SUPER_ADMIN): Edita `name` e `safeUuid`/`safeName`.
- `DELETE /departments/:id` (SUPER_ADMIN): Soft delete (desativa setor).
- `POST /departments/:id/reactivate` (SUPER_ADMIN): Restaura departamento.

## D4Sign
- `GET /d4sign/safes` (SUPER_ADMIN): Lista os cofres da conta D4Sign (usado no cadastro de departamento).
- `GET /d4sign/balance`: Saldo da conta D4Sign. Acesso: `SUPER_ADMIN` sempre; demais só com a flag `canViewBalance` (revalidada no banco).
- `GET /d4sign/documents`: Lista documentos da conta (legado).

## Modelos (Templates)
- `GET /templates`: Lista modelos (filtrados por departamento).
- `POST /templates`: Cria modelo.
- `PATCH /templates/:id`: Edita configurações.
- `DELETE /templates/:id`: Soft delete.
- `POST /templates/:id/upload-docx`: Upload do arquivo Word.
- `PUT /templates/:id/fields`: Sincroniza campos do formulário.
- `PUT /templates/:id/attachments`: Sincroniza anexos exigidos.

## Links de Envio
- `GET /links`: Lista links paginados (com filtros de busca/status/departamento).
- `POST /links`: Cria link individual.
- `POST /links/batch`: Cria lote via CSV.
- `DELETE /links/:token/revoke`: Revoga acesso a um link.
- `POST /links/bulk-revoke`: Revogação em massa.
- `GET /links/submissions/all`: Monitoramento global de submissões.

## Fluxo Público (Sem Token)
- `GET /links/:token`: Valida e retorna dados do link.
- `POST /links/:token/submit`: Envia formulário e inicia processamento D4Sign.
- `POST /links/:token/preview`: Gera visualização do documento preenchido.
- `POST /links/:token/attachment/:attachmentId`: Upload de anexo do cliente.

## Webhooks
- `POST /webhooks/d4sign`: Receptor de eventos (signed, error, etc.) da D4Sign.
