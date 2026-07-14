# Relatórios e Performance

**Rota:** `/admin/reports`  
**Acesso:** ADMIN apenas (`@Roles('ADMIN')` nos endpoints)

---

## Funcionamento

Página de análise consolidada com funil de conversão, tabela detalhada de todas as submissões e métricas de sucesso. Permite exportar os dados filtrados em CSV.

### Isolamento e Filtros
- Os dados são filtrados automaticamente com base no departamento do usuário.
- O **Seletor de Departamentos** aparece para usuários `SUPER_ADMIN` (que veem tudo) e para usuários `ADMIN` que estejam vinculados a **mais de um departamento**.
- Se o `ADMIN` estiver em apenas um departamento, o seletor fica oculto e os dados são filtrados automaticamente para aquela área.
- O filtro de departamento é persistente nas duas chamadas de API principais (`/reports/stats` e `/reports/items`).

---

## Frontend

**Arquivo:** `frontend/src/app/admin/reports/page.tsx`

### Funil de Conversão
4 cards em sequência com seta entre eles:
1. **Links Gerados** — total de `PublicLink` criados
2. **Links Acessados** — total de links com `accessCount > 0`
3. **Formulários Preenchidos** — total de `Submission` criadas
4. **Documentos Assinados** — total de `Submission` com `status = "signed"`

Cada card mostra a contagem, uma barra de progresso proporcional ao maior valor, e a taxa de queda (`-X%`) em relação à etapa anterior.

### Tabela de Análise Detalhada
- **Busca:** filtra por empresa, cliente ou modelo
- **Filtro de status:** select com todos os status possíveis
- **Configuração de colunas:** painel deslizante com checkboxes para mostrar/ocultar colunas individuais
- **Exportar CSV:** gera e baixa um arquivo `.csv` com apenas as colunas visíveis e os registros filtrados no momento

**Colunas disponíveis:**

| Coluna | Padrão |
|---|---|
| Data | Visível |
| Empresa | Visível |
| Cliente | Visível |
| Modelo | Visível |
| Status | Visível |
| Acessos | Visível |
| E-mail Enviado | Oculto |
| Token | Oculto |

Ação por linha: link **Dossier** que abre `https://sandbox.d4sign.com.br/desk/viewblob/{documentUUID}` (somente quando UUID disponível).

### Uso por Modelo (card lateral)
Barras proporcionais mostrando a distribuição de submissões por template.

### Métricas de Sucesso (card lateral)
- **Taxa de preenchimento:** `(preenchidos / acessados) × 100%`
- **Taxa de conclusão:** `(assinados / preenchidos) × 100%`
- **Volume total:** total de links gerados

---

## Backend

**Controller:** `src/app.controller.ts`  
**Service:** `src/dashboard.service.ts`

### Endpoints (todos requerem role ADMIN)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/reports/stats` | Funil + agrupamento por modelo |
| `GET` | `/reports/items` | Tabela completa de submissões correlacionadas |
| `GET` | `/reports/export` | (alias de `/reports/stats`, não usado ativamente) |

### `GET /reports/stats` → `getReportStats()`
Retorna:
```json
{
  "funnel": {
    "generated": 20,
    "accessed": 15,
    "filled": 10,
    "signed": 7
  },
  "byTemplate": [
    { "name": "F.150R02", "count": 8 },
    { "name": "Outro Modelo", "count": 2 }
  ]
}
```

### `GET /reports/items` → `getReportItems()`
Retorna array de objetos correlacionando `Submission` + `PublicLink`:
```json
[
  {
    "id": "...",
    "date": "2024-01-15T...",
    "company": "Empresa XYZ",
    "client": "João Silva",
    "template": "F.150R02",
    "status": "signed",
    "accessCount": 3,
    "emailSent": "2024-01-14T...",
    "token": "uuid-do-link",
    "documentUUID": "uuid-no-d4sign"
  }
]
```
