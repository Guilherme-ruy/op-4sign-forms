# Backup Automático do Banco de Dados

**Última atualização:** 19/05/2026

---

## Visão geral da arquitetura

O backup funciona em duas camadas independentes:

```
[NestJS — cron 02:00]
  └── VACUUM INTO → /data/backups/backup_YYYY-MM-DD.db
        │             (volume Docker: portal-documentos_app_data)
        │
        └── [rclone — crontab da VPS]
              ├── 02:30 → sync volume app_data (exceto pastas efêmeras)
              │     └── gdrive:Backups-Portal/app_data/
              │           ├── db.sqlite          ← banco principal
              │           ├── backups/           ← snapshots diários
              │           └── attachments/       ← arquivos enviados pelos clientes
              │
              └── 02:31 → sync volume templates_data
                    └── gdrive:Backups-Portal/templates/
                          └── <id>-base.pdf      ← PDFs base dos modelos overlay
```

- **A aplicação** cuida apenas de criar o snapshot local e limpar arquivos antigos
- **O rclone** (instalado diretamente na VPS) cuida de enviar tudo para o Google Drive via crontab do sistema — sem container adicional

Essa separação garante que uma falha no upload não afeta o backup local, e uma falha no backup não derruba a aplicação.

---

## Parte 1 — Backup local (NestJS)

### Como funciona

Todo dia às **02:00**, o `BackupService` executa:

```sql
VACUUM INTO '/data/backups/backup_2026-05-19-02-00-00.db';
```

O comando `VACUUM INTO` é nativo do SQLite e cria uma cópia completa e consistente do banco em um novo arquivo, **sem travar leituras ou escritas em andamento**. É o método oficial recomendado para backup a quente de SQLite com WAL mode ativo.

Os arquivos ficam em `/data/backups/` e são apagados automaticamente após 7 dias.

### WAL mode

Na inicialização da aplicação, o `PrismaService` executa automaticamente:

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
```

Isso reduz lock contention quando múltiplos clientes escrevem ao mesmo tempo e é pré-requisito para backups a quente confiáveis.

### Variável obrigatória no .env

```env
BACKUP_DIR=/data/backups
```

> **Atenção:** sem essa variável, o `BackupService` usa o caminho padrão relativo ao binário compilado (`/app/backups/`), que **não está no volume Docker compartilhado** e ficaria inacessível ao rclone. Com `BACKUP_DIR=/data/backups`, os arquivos caem no volume `app_data` (montado em `/data` no container do backend), visível pelo host em `/var/lib/docker/volumes/portal-documentos_app_data/_data/`.

### Acionar backup manualmente (SUPER_ADMIN)

```http
POST /backup/run
Authorization: Bearer <token>
```

Resposta:
```json
{ "message": "Backup concluído com sucesso.", "filename": "backup_2026-05-19-14-30-00.db" }
```

### Arquivos locais gerados

```
/data/backups/                          ← dentro do container backend
  ├── backup_2026-05-17-02-00-00.db
  ├── backup_2026-05-18-02-00-00.db
  └── backup_2026-05-19-02-00-00.db     ← mantém últimos 7 dias

# Equivalente no host da VPS:
/var/lib/docker/volumes/portal-documentos_app_data/_data/backups/
```

---

## Parte 2 — Sincronização com Google Drive (rclone na VPS)

### Por que rclone nativo e não um container?

O rclone executa uma tarefa de ~2 minutos, uma vez por dia. Manter um container rodando 24h/dia apenas para isso é desperdício de recursos. O rclone instalado diretamente na VPS + crontab do sistema é mais simples, mais leve e sem dependências adicionais no `docker-compose.yml`.

### Setup automatizado

Use o script incluído no repositório para configurar tudo de uma vez:

```bash
chmod +x scripts/setup-backup.sh
./scripts/setup-backup.sh
```

O script:
1. Instala o rclone se não estiver presente
2. Guia a autenticação com o Google Drive (abre o assistente `rclone config`)
3. Cria a pasta `Backups-Portal` no Drive se não existir
4. Localiza os volumes Docker (`app_data` e `templates_data`)
5. Faz um upload de teste para validar as credenciais
6. Configura o crontab (02:30 e 02:31 diariamente) de forma idempotente

O que é sincronizado para o Drive:

| Pasta no Drive | Conteúdo | Volume Docker |
|---|---|---|
| `Backups-Portal/app_data/` | Banco SQLite, snapshots diários e **arquivos enviados pelos clientes** | `portal-documentos_app_data` |
| `Backups-Portal/templates/` | PDFs base dos modelos overlay | `portal-documentos_templates_data` |

```bash
# Exemplo com pasta personalizada no Drive:
./scripts/setup-backup.sh Backups-Portal-Producao
```

---

### Setup manual (passo a passo)

Se preferir configurar à mão:

#### 1. Instalar rclone

```bash
curl https://rclone.org/install.sh | sudo bash
rclone --version
```

#### 2. Autenticar com Google Drive

```bash
rclone config
```

Siga os passos:
1. `n` → nova configuração
2. Name: `gdrive`
3. Storage: escolha `drive` (Google Drive)
4. Client ID e Secret: deixe em branco (usa credenciais padrão do rclone)
5. Scope: `1` (acesso completo)
6. Root folder ID: deixe em branco
7. `n` para não editar configuração avançada
8. `y` para autenticar via browser → copie o link, faça login com a conta Google
9. `n` para não configurar como shared drive
10. Confirme com `y`

> **Servidor headless:** copie o link gerado e abra em outro dispositivo para autenticar.

#### 3. Verificar autenticação

```bash
rclone lsd gdrive:
```

#### 4. Criar pasta no Drive (se não existir)

```bash
rclone mkdir gdrive:Backups-Portal
```

#### 5. Localizar o caminho dos backups no host

```bash
docker volume inspect portal-documentos_app_data --format '{{.Mountpoint}}'
# Saída típica: /var/lib/docker/volumes/portal-documentos_app_data/_data
```

O caminho completo dos backups será:
```
/var/lib/docker/volumes/portal-documentos_app_data/_data/backups
```

#### 6. Testar upload

```bash
rclone copy /var/lib/docker/volumes/portal-documentos_app_data/_data/backups/ \
  gdrive:Backups-Portal --progress
```

#### 7. Configurar o crontab

```bash
crontab -e
```

Adicione as duas linhas (30 min após o backup local às 02:00):

```cron
# Portal de Documentos — backup para Google Drive (banco + anexos + templates)
30 2 * * * rclone sync /var/lib/docker/volumes/portal-documentos_app_data/_data gdrive:Backups-Portal/app_data --exclude 'generated/**' --exclude 'previews/**' --exclude 'pending-attachments/**' --log-level INFO >> /var/log/rclone-backup.log 2>&1
31 2 * * * rclone sync /var/lib/docker/volumes/portal-documentos_templates_data/_data gdrive:Backups-Portal/templates --log-level INFO >> /var/log/rclone-backup.log 2>&1
```

> Use `rclone sync` (espelha o destino) ou `rclone copy` (nunca apaga do Drive). Para histórico permanente dos documentos dos clientes, prefira `copy` na linha dos `attachments`.

**Verificar:**
```bash
crontab -l
tail -f /var/log/rclone-backup.log
```

---

## Restaurar um backup

1. Baixe o arquivo `.db` desejado do Google Drive (ou use o backup local):
   ```bash
   rclone copy gdrive:Backups-Portal/backup_2026-05-18-02-00-00.db /tmp/
   ```

2. Pare o backend:
   ```bash
   docker compose stop backend
   ```

3. Substitua o banco (dentro do volume Docker):
   ```bash
   cp /tmp/backup_2026-05-18-02-00-00.db \
     /var/lib/docker/volumes/portal-documentos_app_data/_data/db/portal.db
   ```

4. Reinicie:
   ```bash
   docker compose start backend
   ```

---

## Arquivos envolvidos no sistema de backup

| Arquivo | Descrição |
|---|---|
| `backend/src/backup/backup.service.ts` | Cron 02:00 + VACUUM INTO + limpeza de arquivos antigos |
| `backend/src/backup/backup.module.ts` | Módulo NestJS |
| `backend/src/backup/backup.controller.ts` | Endpoint `POST /backup/run` para acionamento manual |
| `backend/src/prisma.service.ts` | Habilita WAL mode na inicialização |
| `scripts/setup-backup.sh` | Script interativo de setup do rclone + crontab na VPS |
| `.env` | Deve conter `BACKUP_DIR=/data/backups` em produção |

---

## O que é salvo em cada camada

| O quê | Onde fica (container) | Backup? |
|---|---|---|
| Banco de dados (formulários, status, metadados) | `/data/db/portal.db` | ✅ snapshot diário + rclone |
| **Arquivos enviados pelos clientes** (PDFs, fotos, docs) | `/data/attachments/` | ✅ rclone 02:30 |
| Snapshots diários do banco | `/data/backups/` | ✅ rclone 02:30 |
| PDFs base dos modelos overlay | `/app/templates/` | ✅ rclone 02:31 |
| Documentos gerados (enviados à D4Sign) | `/data/generated/` | ❌ temporário, deletado após upload |
| Previews do formulário | `/data/previews/` | ❌ temporário, expira em 2h |
| Uploads em andamento | `/data/pending-attachments/` | ❌ temporário, movido no submit |

## Resumo de responsabilidades

| Quem | O que faz |
|---|---|
| NestJS (`BackupService`) | Cria snapshot local às 02:00, limpa arquivos > 7 dias |
| rclone 02:30 (crontab da VPS) | Sincroniza volume `app_data` inteiro (banco + anexos dos clientes) |
| rclone 02:31 (crontab da VPS) | Sincroniza volume `templates_data` (PDFs base dos modelos overlay) |
| Google Drive | Armazenamento remoto com histórico permanente |
