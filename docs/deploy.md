# Guia de Deploy

**Última atualização:** 14/07/2026

---

## Pré-requisitos na VPS

- Ubuntu 22.04 ou superior
- Docker Engine instalado
- Docker Compose plugin instalado (`docker compose`, não `docker-compose`)
- Portas 3001 (API) e 3030 (frontend) liberadas no firewall, ou as portas do seu reverse proxy caso use um na frente

### Instalar Docker (se ainda não tiver)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

---

## Primeiro Deploy

### 1. Clonar o repositório

```bash
git clone <url-do-repositorio> portal-documentos
cd portal-documentos
```

### 2. Configurar o ambiente

```bash
cp .env.example .env
nano .env
```

Altere **obrigatoriamente** estas variáveis:

```env
# URL pública do servidor (IP ou domínio)
NEXT_PUBLIC_API_URL=https://documentos.suaempresa.com.br/api
FRONTEND_URL=https://documentos.suaempresa.com.br

# Gere uma chave segura (obrigatório — o backend não inicia sem isso):
# openssl rand -hex 32
JWT_SECRET=cole-aqui-a-chave-gerada

# D4Sign de PRODUÇÃO (troque a base URL do sandbox para produção)
D4SIGN_BASE_URL=https://secure.d4sign.com.br/api/v1
D4SIGN_TOKEN_API=seu-token-de-producao
D4SIGN_CRYPT_KEY=sua-crypt-key-de-producao
D4SIGN_DRY_RUN=false

# Backup — obrigatório para os backups caírem no volume persistente
BACKUP_DIR=/data/backups
```

> Se for usar domínio, aponte o DNS antes de continuar.

> **Atenção:** O `docker compose` lê o arquivo `.env` da raiz automaticamente — ele serve tanto para substituição de variáveis no `docker-compose.yml` quanto para injetar as variáveis no container do backend. Não renomeie para outro nome.

### 3. Buildar e subir os containers

```bash
docker compose up -d --build
```

Aguarde o build (pode levar 3–5 minutos na primeira vez). Verifique se todos os containers subiram:

```bash
docker compose ps
```

Resultado esperado — todos com status `running`:

```
NAME                         STATUS
portal-documentos-backend    running
portal-documentos-frontend   running
portal-documentos-gotenberg  running
```

### 4. Criar o super admin (só na primeira vez)

```bash
docker compose exec backend npx prisma db seed
```

Isso cria o usuário `admin@suaempresa.com.br` com a senha `DEFINIR_SENHA_AQUI` e os departamentos iniciais (RH, Financeiro, T.I.).

> **Troque a senha imediatamente após o primeiro login.**

### 5. Testar

Acesse `http://SEU_IP:3030` no browser. O sistema deve estar funcionando.

```bash
# Acompanhar logs em tempo real
docker compose logs -f

# Testar se o backend responde
curl http://localhost:3001/health
```

> Sem reverse proxy configurado, backend e frontend ficam expostos diretamente nas portas 3001 e 3030. Para produção, recomenda-se colocar um reverse proxy (Nginx, Caddy, Traefik etc.) na frente para centralizar em uma única porta/domínio e cuidar do HTTPS.

---

## Próximos Deploys (atualização de código)

```bash
# 1. Puxa as mudanças
git pull

# 2. Rebuilda os containers afetados e reinicia
docker compose up -d --build
```

O `--build` reconstrói somente as imagens que tiveram arquivos alterados. O banco de dados e todos os arquivos em volumes persistentes (`app_data`, `templates_data`) são preservados automaticamente.

### Se só o frontend mudou

```bash
docker compose up -d --build frontend
```

### Se só o backend mudou

```bash
docker compose up -d --build backend
```

> **Atenção:** `NEXT_PUBLIC_API_URL` é gravada no bundle em tempo de build do frontend. Se precisar mudar a URL da API, rebuilde o frontend.

---

## Ativar HTTPS (quando tiver domínio)

O projeto não inclui reverse proxy próprio — backend e frontend ficam expostos diretamente nas portas 3001 e 3030. Para HTTPS e domínio próprio, coloque um reverse proxy de sua escolha (Nginx, Caddy, Traefik etc.) na frente dessas portas na VPS e emita o certificado por ali (ex.: Certbot, ou o provisionamento automático do Caddy/Traefik).

Depois de configurar o proxy e o certificado, atualize o `.env` e rebuilde o frontend:

```env
NEXT_PUBLIC_API_URL=https://documentos.suaempresa.com.br/api
FRONTEND_URL=https://documentos.suaempresa.com.br
```

```bash
docker compose up -d --build frontend
```

---

## Configurar webhook da D4Sign (opcional — para status automático)

O webhook permite que a D4Sign notifique o sistema automaticamente quando um documento é assinado, atualizando o status sem precisar clicar em "Sincronizar" manualmente.

**Sem webhook:** o sistema funciona normalmente — use o botão Sincronizar no painel quando quiser atualizar o status.

**Com webhook:**

1. No painel da D4Sign, vá em **Configurações → Webhooks** e registre a URL:
   ```
   https://documentos.suaempresa.com.br/api/webhooks/d4sign
   ```

2. Gere uma secret e anote:
   ```bash
   openssl rand -hex 32
   ```

3. Adicione ao `.env`:
   ```env
   D4SIGN_WEBHOOK_SECRET=sua-secret-gerada
   ```

4. Rebuilde o backend:
   ```bash
   docker compose up -d --build backend
   ```

---

## Comandos úteis do dia a dia

### Ver logs

```bash
# Todos os containers
docker compose logs -f

# Só o backend
docker compose logs -f backend

# Últimas 100 linhas do backend
docker compose logs --tail=100 backend
```

### Reiniciar um container específico

```bash
docker compose restart backend
docker compose restart frontend
```

### Acessar o terminal de um container

```bash
docker compose exec backend sh

# Dentro do container:
npx prisma studio          # interface visual do banco (cuidado em produção)
npx prisma migrate deploy  # aplica migrations manualmente se necessário
npx prisma db seed         # recria o super admin inicial
```

### Ver uso de disco dos volumes

```bash
docker system df -v
```

### Forçar backup manual do banco

```bash
curl -X POST http://localhost:3001/backup/run \
  -H "Authorization: Bearer SEU_TOKEN_JWT"
```

O snapshot é salvo em `/data/backups/` (volume `portal-documentos_app_data`), com limpeza automática de arquivos com mais de 7 dias. Não há sincronização remota automática — para levar os backups para fora da VPS, copie o arquivo periodicamente para onde preferir.

---

## Estrutura de arquivos persistentes na VPS

Todos os dados ficam em volumes Docker gerenciados automaticamente:

```bash
docker volume inspect portal-documentos_app_data
# Retorna o caminho real em /var/lib/docker/volumes/...
```

| Volume | Conteúdo |
|---|---|
| `portal-documentos_app_data` | Banco SQLite, anexos dos clientes, backups diários |
| `portal-documentos_templates_data` | PDFs base dos modelos overlay |

---

## Troubleshooting

### Container backend sobe e cai imediatamente

```bash
docker compose logs backend
```

Causas comuns:
- `JWT_SECRET` ausente ou vazio no `.env`
- `DATABASE_URL` incorreto no `.env`
- Migration falhou (banco corrompido ou incompatível)

### Frontend não consegue chamar a API

Verifique se `NEXT_PUBLIC_API_URL` no `.env` está correto **antes do build** — a URL é gravada no bundle em tempo de build. Se precisar corrigir:

```bash
docker compose up -d --build frontend
```

### Upload de template retorna erro

O backend limita uploads a 20MB (documentos/anexos) ou 50MB (arquivo base do modelo), definido em `backend/src/templates/templates.controller.ts` e `backend/src/links/links.controller.ts` (`FileInterceptor(..., { limits: { fileSize: ... } })`). Para aumentar, ajuste o valor nesses arquivos e rebuilde o backend. Se houver um reverse proxy na frente, verifique também o limite de tamanho de body configurado nele.
