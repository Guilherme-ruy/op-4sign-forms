# Dashboard

**Rota:** `/admin`  
**Acesso:** ADMIN e OPERATOR (dados filtrados por perfil)

---

## Funcionamento

Página inicial após o login. Exibe uma visão geral em tempo real do estado do portal: links ativos, documentos em andamento, assinados e submissões recentes.

Os dados são **filtrados por permissão e departamento**:
- **SUPER_ADMIN** vê números globais e pode filtrar por qualquer departamento individualmente ou em conjunto.
- **ADMIN** vê apenas os dados dos departamentos aos quais está vinculado. Se estiver em mais de um, pode usar o seletor para alternar entre eles.
- **OPERATOR** vê apenas os dados dos links que ele mesmo criou dentro dos departamentos autorizados.

O dashboard conta com um **Seletor de Departamentos** no cabeçalho que permite filtrar as métricas em tempo real. Os dados são atualizados automaticamente a cada **30 segundos**.

### Filtragem Técnica
O componente `DepartmentSelector` envia uma query string `departmentIds[]` para o backend. O serviço `DashboardService` intercepta esses IDs e realiza a interseção com os departamentos permitidos no JWT do usuário, garantindo que ninguém filtre dados aos quais não tem acesso.

---

## Frontend

**Arquivo:** `frontend/src/app/admin/page.tsx`

### Cards de resumo (4 cards)
| Card | Métrica |
|---|---|
| Links Ativos | Links não revogados e não expirados |
| Aguardando Assinatura | Submissões com status `sent_to_sign` |
| Assinados | Submissões com status `signed` |
| Total de Submissões | Todos os formulários preenchidos |

### Atividades Recentes
- Lista as últimas 6 submissões (mais recentes primeiro)
- Exibe: empresa (`COMPANY_LEGAL_NAME` do formData), nome do modelo, data/hora, badge de status
- Ícone de link externo para abrir o documento no painel D4Sign (quando `documentUUID` disponível)
- Botão "Ver todos" redireciona para `/admin/documents`

### Documentos por Status (coluna lateral)
- Lista a contagem de submissões agrupadas por status, ordenadas do maior para o menor

### Card Saldo D4Sign (coluna lateral)
- Exibe os **créditos disponíveis** da conta D4Sign (`credit − sent`), barra de uso e "X de Y créditos usados (%)".
- Dados de `GET /d4sign/balance` (atualiza a cada 60s). O saldo é **da conta** das credenciais no `.env` (token + cryptKey), não por cofre.
- **Visibilidade:** só aparece para `SUPER_ADMIN` **ou** usuários com a flag `canViewBalance` marcada (padrão desmarcada, definida em `/admin/users`). O backend revalida a permissão no banco a cada requisição.

---

## Backend

**Controller:** `src/app.controller.ts`  
**Service:** `src/dashboard.service.ts`

### `GET /dashboard/stats`
- Requer autenticação
- Recebe `req.user` e aplica filtro por `createdById` se role for `OPERATOR`
- Retorna:
```json
{
  "linksActive": 5,
  "linksTotal": 12,
  "signed": 3,
  "sentToSign": 2,
  "totalSubmissions": 8,
  "statusBreakdown": { "signed": 3, "sent_to_sign": 2, "error": 1 },
  "recentSubmissions": [
    {
      "id": "...",
      "status": "signed",
      "createdAt": "...",
      "documentUUID": "...",
      "company": "Empresa XYZ",
      "templateName": "F.150R02"
    }
  ]
}
```

---

## Banco de dados envolvido

- `PublicLink` — contagem de ativos/total (filtrado por `createdById` para OPERATOR)
- `Submission` — contagem por status, lista recente (filtrado via join com `PublicLink.createdById`)
