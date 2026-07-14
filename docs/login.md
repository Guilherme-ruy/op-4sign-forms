# Login

**Rota:** `/login`  
**Acesso:** público (sem autenticação)

---

## Funcionamento

Página de autenticação do portal administrativo. Ao fazer login com sucesso, o JWT é armazenado no `localStorage` do browser e o usuário é redirecionado para `/admin`.

Se o usuário já estiver autenticado (token válido no localStorage), o `admin/layout.tsx` impede o acesso ao `/login` redirecionando para `/admin` automaticamente.

---

## Frontend

**Arquivo:** `frontend/src/app/login/page.tsx`

- Formulário com campos `email` e `senha`
- Chama `useAuth().login()` ao submeter
- Em caso de erro (credenciais inválidas), exibe mensagem em vermelho
- Botão com spinner de loading durante a requisição

**`AuthContext`** (`frontend/src/contexts/AuthContext.tsx`):

- Ao montar, lê o token do `localStorage` e valida chamando `GET /auth/me`
- Se válido, popula `user` com `{ id, email, name, role }`
- Se inválido, limpa o token e define `user = null`
- `login(email, password)` → chama `POST /auth/login`, salva o token, define `user`
- `logout()` → remove token do localStorage, limpa header do axios, define `user = null`

**`api.ts`** (`frontend/src/lib/api.ts`):

- Interceptor de request injeta `Authorization: Bearer <token>` em toda requisição, lendo do `localStorage`

---

## Backend

**Controller:** `src/auth/auth.controller.ts`  
**Service:** `src/auth/auth.service.ts`

### `POST /auth/login`
- Rota pública (`@Public()`)
- Body: `{ email: string, password: string }`
- Busca o usuário pelo email, compara a senha com `bcrypt.compare`
- Retorna: `{ accessToken: string, user: { id, email, name, role } }`
- Erros: `401 Unauthorized` se credenciais inválidas

### `GET /auth/me`
- Rota protegida (requer JWT)
- Retorna os dados do usuário autenticado a partir do `sub` do JWT

---

## Segurança

- Senhas armazenadas com `bcrypt` (salt rounds = 12)
- JWT com expiração de **7 dias**
- Secret configurado em `backend/.env` (`JWT_SECRET`)
- Todas as rotas da API são protegidas por padrão pelo guard global `JwtAuthGuard`; rotas públicas usam `@Public()`
