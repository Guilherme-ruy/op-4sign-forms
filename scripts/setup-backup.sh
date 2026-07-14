#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-backup.sh — configura backup automático do Portal de Documentos na VPS
#
# O que faz:
#   1. Instala rclone se não estiver presente
#   2. Guia a autenticação com Google Drive (se ainda não configurada)
#   3. Cria a pasta de destino no Drive se não existir
#   4. Localiza o volume Docker com os backups
#   5. Adiciona entrada no crontab (02:30 diariamente)
#   6. Faz um upload de teste para confirmar que tudo funciona
#
# Uso:
#   chmod +x scripts/setup-backup.sh
#   ./scripts/setup-backup.sh [nome-da-pasta-no-drive]
#
# Exemplo com pasta personalizada:
#   ./scripts/setup-backup.sh Backups-Portal-Producao
#
# Pré-requisito: docker-compose já executado ao menos uma vez
#   (para que o volume portal-documentos_app_data exista)
# ─────────────────────────────────────────────────────────────────────────────

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step()  { echo -e "\n${BOLD}▶ $1${NC}"; }
line()  { echo "─────────────────────────────────────────────────────────────"; }

GDRIVE_FOLDER="${1:-Backups-Portal}"
DOCKER_VOLUME="portal-documentos_app_data"
TEMPLATES_VOLUME="portal-documentos_templates_data"
LOG_FILE="/var/log/rclone-backup.log"

line
echo -e "  ${BOLD}Portal de Documentos — Setup de Backup Automático${NC}"
line

# ── 1. Verificar/instalar rclone ─────────────────────────────────────────────
step "1/6 — Verificando rclone..."

if ! command -v rclone &>/dev/null; then
  warn "rclone não encontrado. Instalando..."
  curl https://rclone.org/install.sh | sudo bash
  info "rclone instalado: $(rclone --version | head -1)"
else
  info "rclone já instalado: $(rclone --version | head -1)"
fi

# ── 2. Configurar Google Drive ────────────────────────────────────────────────
step "2/6 — Verificando configuração do Google Drive..."

if ! rclone listremotes | grep -q "^gdrive:"; then
  warn "Remote 'gdrive' não encontrado. Iniciando configuração interativa..."
  echo ""
  echo "  Siga os passos no assistente:"
  echo "  • Pressione 'n' → nova configuração"
  echo "  • Nome: gdrive"
  echo "  • Tipo: drive  (Google Drive)"
  echo "  • client_id e client_secret: deixe em branco (Enter)"
  echo "  • Scope: 1  (acesso completo)"
  echo "  • Token: autentique no browser quando o link aparecer"
  echo "  • Shared drive: n"
  echo ""
  read -rp "  Pressione Enter para iniciar o rclone config..." _
  rclone config

  if ! rclone listremotes | grep -q "^gdrive:"; then
    error "Configuração do Google Drive não foi concluída. Execute novamente."
  fi
fi

info "Google Drive configurado (remote: gdrive)."

# ── 3. Criar pasta de destino no Drive ───────────────────────────────────────
step "3/6 — Verificando pasta '${GDRIVE_FOLDER}' no Google Drive..."

if rclone lsd "gdrive:" | grep -q "${GDRIVE_FOLDER}"; then
  info "Pasta '${GDRIVE_FOLDER}' já existe no Google Drive."
else
  rclone mkdir "gdrive:${GDRIVE_FOLDER}"
  info "Pasta '${GDRIVE_FOLDER}' criada no Google Drive."
fi

# ── 4. Localizar volumes Docker ───────────────────────────────────────────────
step "4/6 — Localizando volumes Docker..."

if ! command -v docker &>/dev/null; then
  error "docker não encontrado. O deploy foi feito?"
fi

VOLUME_PATH=$(docker volume inspect "${DOCKER_VOLUME}" --format '{{.Mountpoint}}' 2>/dev/null || echo "")

if [ -z "$VOLUME_PATH" ]; then
  error "Volume '${DOCKER_VOLUME}' não encontrado. Execute 'docker compose up -d' primeiro."
fi

TEMPLATES_PATH=$(docker volume inspect "${TEMPLATES_VOLUME}" --format '{{.Mountpoint}}' 2>/dev/null || echo "")

if [ -z "$TEMPLATES_PATH" ]; then
  warn "Volume '${TEMPLATES_VOLUME}' não encontrado. Templates não serão incluídos no backup."
fi

BACKUP_PATH="${VOLUME_PATH}/backups"
mkdir -p "$BACKUP_PATH"
info "Dados em:    ${VOLUME_PATH}"
info "Templates:   ${TEMPLATES_PATH:-não encontrado}"

# ── 5. Testar conexão ─────────────────────────────────────────────────────────
step "5/6 — Testando conexão e upload..."

# Cria arquivo de teste
TEST_FILE="${BACKUP_PATH}/.rclone-test"
echo "teste $(date)" > "$TEST_FILE"

if rclone copy "$TEST_FILE" "gdrive:${GDRIVE_FOLDER}/app_data/backups" --log-level ERROR; then
  rclone deletefile "gdrive:${GDRIVE_FOLDER}/app_data/backups/.rclone-test" 2>/dev/null || true
  rm -f "$TEST_FILE"
  info "Upload para Google Drive OK."
else
  rm -f "$TEST_FILE"
  error "Falha no upload. Verifique as credenciais do rclone."
fi

# ── 6. Configurar crontab ─────────────────────────────────────────────────────
step "6/6 — Configurando crontab..."

# Criar arquivo de log
sudo touch "$LOG_FILE"
sudo chmod 666 "$LOG_FILE"

CRON_COMMENT="# Portal de Documentos — backup para Google Drive (banco + anexos + templates)"
# Linha 1: dados principais (banco, snapshots, anexos dos clientes) — exclui pastas efêmeras
CRON_DATA="30 2 * * * rclone sync ${VOLUME_PATH} gdrive:${GDRIVE_FOLDER}/app_data --exclude 'generated/**' --exclude 'previews/**' --exclude 'pending-attachments/**' --log-level INFO >> ${LOG_FILE} 2>&1"
# Linha 2: templates (DOCX e PDF base dos modelos) — só se o volume existir
CRON_TEMPLATES=""
if [ -n "$TEMPLATES_PATH" ]; then
  CRON_TEMPLATES="31 2 * * * rclone sync ${TEMPLATES_PATH} gdrive:${GDRIVE_FOLDER}/templates --log-level INFO >> ${LOG_FILE} 2>&1"
fi

# Remove entradas antigas do portal e adiciona as novas
CURRENT_CRON=$(crontab -l 2>/dev/null || true)
CLEAN_CRON=$(echo "$CURRENT_CRON" | grep -v "Portal de Documentos" | grep -v "rclone.*${GDRIVE_FOLDER}" || true)
if [ -n "$CRON_TEMPLATES" ]; then
  (echo "$CLEAN_CRON"; echo "$CRON_COMMENT"; echo "$CRON_DATA"; echo "$CRON_TEMPLATES") | crontab -
else
  (echo "$CLEAN_CRON"; echo "$CRON_COMMENT"; echo "$CRON_DATA") | crontab -
fi

info "Crontab configurado (02:30 diariamente)."

# ── Resumo ────────────────────────────────────────────────────────────────────
echo ""
line
echo -e "  ${GREEN}${BOLD}Backup configurado com sucesso!${NC}"
line
echo ""
echo "  O que é salvo no Drive (gdrive:${GDRIVE_FOLDER}):"
echo "    app_data/  ← banco SQLite, snapshots e anexos enviados pelos clientes"
if [ -n "$TEMPLATES_PATH" ]; then
echo "    templates/ ← PDFs base dos modelos overlay"
fi
echo "  Horário:  02:30 dados principais / 02:31 templates"
echo "  Log:      ${LOG_FILE}"
echo ""
echo "  Para executar um sync agora (dados + anexos):"
echo "  rclone sync ${VOLUME_PATH} gdrive:${GDRIVE_FOLDER}/app_data --exclude 'generated/**' --exclude 'previews/**' --exclude 'pending-attachments/**' --progress"
if [ -n "$TEMPLATES_PATH" ]; then
echo ""
echo "  Para sincronizar templates agora:"
echo "  rclone sync ${TEMPLATES_PATH} gdrive:${GDRIVE_FOLDER}/templates --progress"
fi
echo ""
echo "  Para acompanhar o log:"
echo "  tail -f ${LOG_FILE}"
echo ""
line
