#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ] && grep -q '^APP_KEY=base64:' .env; then
  chmod 600 .env
  printf 'Konfigurasi .env sudah ada; tidak diubah.\n'
  exit 0
fi
umask 077
cp .env.example .env
chmod 600 .env
sed -i "s|^APP_KEY=.*|APP_KEY=base64:$(openssl rand -base64 32)|; s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|; s|^DB_ROOT_PASSWORD=.*|DB_ROOT_PASSWORD=$(openssl rand -hex 24)|; s|^INITIAL_ADMIN_PASSWORD=.*|INITIAL_ADMIN_PASSWORD=$(openssl rand -hex 16)|" .env
printf 'Konfigurasi dan password acak dibuat di .env (jangan commit).\nLogin awal: admin@stock.local; password: lihat INITIAL_ADMIN_PASSWORD di .env.\n'
