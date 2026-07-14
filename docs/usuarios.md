# Gestão de Acesso

**Rota:** `/admin/users`  
**Acesso:** `SUPER_ADMIN` apenas.

---

## Níveis de Acesso

| Perfil | Descrição |
|---|---|
| `SUPER_ADMIN` | Acesso total. Único que pode gerenciar usuários e departamentos através da página de **Gestão de Acesso**. O usuário `admin@suaempresa.com.br` é protegido contra edição/exclusão. |
| `ADMIN` | Administrador departamental. Vê links, modelos e relatórios apenas dos seus departamentos. Não possui acesso à Gestão de Acesso. |
| `OPERATOR` | Operador restrito. Vê apenas modelos autorizados e links que ele mesmo criou. Não possui acesso à Gestão de Acesso. |

---

## Funcionamento

O gerenciamento de acessos centraliza usuários, departamentos e permissões com suporte a **Soft Delete**.
- Um usuário pode estar em múltiplos departamentos.
- **Cofre por departamento:** cada departamento é vinculado a um **cofre D4Sign** (obrigatório na criação/edição). Os documentos gerados a partir de modelos daquele departamento são enviados para esse cofre. A lista de cofres vem de `GET /d4sign/safes` (restrito a `SUPER_ADMIN`).
- **Permissão de saldo (`canViewBalance`):** flag por usuário (padrão **desmarcada**) que libera a visualização do saldo D4Sign no dashboard. `SUPER_ADMIN` vê o saldo sempre, independente da flag.
- A role `SUPER_ADMIN` **não pode ser criada ou atribuída via sistema** (apenas via banco de dados/seed) para garantir a segurança.
- O Super Admin mestre (`admin@suaempresa.com.br`) possui travas no backend que impedem sua alteração ou exclusão via API.
- **Exclusão Lógica**: Ao deletar um usuário, ele é marcado com `deletedAt`. Ele perde acesso ao sistema imediatamente, mas seus dados permanecem para auditoria.
- **Lixeira e Reativação**: O Super Admin pode restaurar usuários ou departamentos deletados na aba de "Lixeira".
    - **Confirmação de Segurança**: Para evitar reativações acidentais, o sistema exige que o administrador digite **"sim"** para confirmar a restauração.

---

## Backend

**Controller:** `src/users/users.controller.ts`  
**Service:** `src/users/users.service.ts`

### Proteções de Segurança (Hardening)
- `create`: Bloqueia a criação de usuários com role `SUPER_ADMIN`.
- `update`: Bloqueia edição de usuários `SUPER_ADMIN` e promoção de outros usuários a este cargo.
- `remove`: Impede a exclusão de usuários `SUPER_ADMIN`.
- `Access Control`: O frontend bloqueia o acesso à página para qualquer role diferente de `SUPER_ADMIN`, exibindo uma tela de erro amigável.

### Endpoints de Departamento e Soft Delete
- Os departamentos são persistidos na tabela `UserDepartment`.
- Na criação/edição, o campo `departmentIds` (array de UUIDs) sincroniza os vínculos.
- `POST`/`PATCH /departments` exigem `name` **e** `safeUuid` (cofre D4Sign) — rejeitam com `400` se faltar qualquer um.
- `PATCH /users/:id` aceita `canViewBalance` (boolean) para ligar/desligar a permissão de saldo.
- `POST /users/:id/reactivate`: Restaura um usuário deletado.
- `POST /departments/:id/reactivate`: Restaura um departamento deletado.

---

## Interface Administrativa

A tela de **Gestão de Acesso** é organizada em **Abas**:
1. **Usuários**: Listagem e edição de contas ativas.
2. **Departamentos**: CRUD de setores da empresa. Cada departamento precisa de um **cofre D4Sign** vinculado (select populado pelos cofres da conta). A lista mostra o cofre de cada setor.
3. **Lixeira**: Visualização e reativação de itens excluídos logicamente (com confirmação por texto).

---

## Banco de dados

### `User`
```prisma
model User {
  id             String           @id @default(uuid())
  email          String           @unique
  name           String?
  password       String
  role           String           // SUPER_ADMIN | ADMIN | OPERATOR
  canViewBalance Boolean          @default(false) // pode ver o saldo D4Sign no dashboard
  departments    UserDepartment[]
  createdAt      DateTime         @default(now())
  deletedAt      DateTime?        // Soft Delete
}
```

### `Department`
```prisma
model Department {
  id        String @id @default(uuid())
  name      String @unique
  safeUuid  String?          // UUID do cofre D4Sign vinculado (obrigatório na API; nullable p/ registros legados)
  safeName  String?          // Nome do cofre D4Sign (exibição)
  users     UserDepartment[]
  deletedAt DateTime?        // Soft Delete
}
```

### `UserDepartment`
Tabela intermediária (N:N) que vincula o usuário ao seu escopo de dados.
```prisma
model UserDepartment {
  userId       String
  departmentId String
  user         User       @relation(fields: [userId], references: [id])
  department   Department @relation(fields: [departmentId], references: [id])
}
```
