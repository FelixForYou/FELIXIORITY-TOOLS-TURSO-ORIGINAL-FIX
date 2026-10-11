#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
origin="${1:-}"
origin="${origin,,}"
if [[ ! "$origin" =~ ^https://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]]; then
  echo 'Penggunaan: bash deploy/setup.sh https://tools.domainanda.com' >&2
  exit 1
fi
command -v docker >/dev/null || { echo 'Docker belum terpasang. Ikuti README.' >&2; exit 1; }
docker compose version >/dev/null
if [[ ! -f .env ]]; then
  command -v openssl >/dev/null
  umask 077
  cp .env.example .env
  secret="$(openssl rand -hex 32)"
  sed -i "s|^APP_ORIGIN=.*|APP_ORIGIN=$origin|; s|^SESSION_SECRET=.*|SESSION_SECRET=$secret|; s|^TRUST_PROXY=.*|TRUST_PROXY=true|" .env
  unset secret
else
  echo '.env sudah ada; konfigurasi yang ada dipertahankan.'
fi
if ! grep -Eq '^TURSO_DATABASE_URL=libsql://[^[:space:]]+' .env || ! grep -Eq '^TURSO_AUTH_TOKEN=[^[:space:]]+' .env; then
  echo 'Isi TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN di .env, lalu jalankan: docker compose up -d --build' >&2
  exit 1
fi
docker compose up -d --build
printf '\nAplikasi berjalan di 127.0.0.1:3000.\nPasang Nginx + HTTPS sesuai README sebelum menghubungkan panel.\n'
