#!/bin/sh
set -e

# Garante que todos os diretórios de dados existam antes do app subir
mkdir -p /data/db \
         /data/generated \
         /data/previews \
         /data/attachments \
         /data/pending-attachments \
         /data/backups

# Aplica apenas mudanças aditivas no schema (sem --accept-data-loss para proteger dados)
npx prisma db push

exec node dist/src/main
