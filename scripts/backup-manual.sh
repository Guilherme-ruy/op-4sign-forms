#!/bin/bash
# Backup manual do Portal de Documentos — banco local + sync Google Drive

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

line
echo -e "  ${BOLD}Portal de Documentos — Backup Manual${NC}"
echo -e "  $(date '+%Y-%m-%d %H:%M:%S')"
line

# ── 1. Snapshot local via API ─────────────────────────────────────────────────
step "1/3 — Criando snapshot local (VACUUM INTO)..."

if [ -z "$BACKUP_TOKEN" ]; then
  warn "Variável BACKUP_TOKEN não definida — pulando snapshot via API."
  warn "Para incluir o snapshot, rode: BACKUP_TOKEN=<token-super-admin> $0"
else
  RESPONSE=$(curl -s -o /tmp/backup-response.json -w "%{http_code}" \
    -X POST https://documentos.suaempresa.com.br/api/backup/run \
    -H "Authorization: Bearer ${BACKUP_TOKEN}")

  if [ "$RESPONSE" = "200" ]; then
    FILENAME=$(cat /tmp/backup-response.json | grep -o '"filename":"[^"]*"' | cut -d'"' -f4)
    info "Snapshot criado: ${FILENAME}"
  else
    error "Falha no snapshot (HTTP ${RESPONSE}). Verifique o token SUPER_ADMIN."
  fi
fi

# ── 2. Sync app_data → Google Drive ──────────────────────────────────────────
step "2/3 — Sincronizando app_data com Google Drive..."

VOLUME_PATH=$(docker volume inspect "${DOCKER_VOLUME}" --format '{{.Mountpoint}}' 2>/dev/null || echo "")
if [ -z "$VOLUME_PATH" ]; then
  error "Volume '${DOCKER_VOLUME}' não encontrado. O docker compose está rodando?"
fi

rclone sync "${VOLUME_PATH}" "gdrive:${GDRIVE_FOLDER}/app_data" \
  --exclude 'generated/**' \
  --exclude 'previews/**' \
  --exclude 'pending-attachments/**' \
  --log-level INFO \
  --progress

info "app_data sincronizado."

# ── 3. Sync templates_data → Google Drive ────────────────────────────────────
step "3/3 — Sincronizando templates com Google Drive..."

TEMPLATES_PATH=$(docker volume inspect "${TEMPLATES_VOLUME}" --format '{{.Mountpoint}}' 2>/dev/null || echo "")
if [ -z "$TEMPLATES_PATH" ]; then
  warn "Volume '${TEMPLATES_VOLUME}' não encontrado — templates não sincronizados."
else
  rclone sync "${TEMPLATES_PATH}" "gdrive:${GDRIVE_FOLDER}/templates" \
    --log-level INFO \
    --progress
  info "Templates sincronizados."
fi

# ── Resumo ────────────────────────────────────────────────────────────────────
echo ""
line
echo -e "  ${GREEN}${BOLD}Backup manual concluído!${NC}"
echo -e "  Drive: gdrive:${GDRIVE_FOLDER}"
line
