#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "エラー: .env が見つかりません。.env.example をコピーして値を設定してください。" >&2
  exit 1
fi
# shellcheck disable=SC1091
source .env

: "${FTP_HOST:?FTP_HOST が未設定です}"
: "${FTP_USER:?FTP_USER が未設定です}"
: "${FTP_PASS:?FTP_PASS が未設定です}"
: "${FTP_REMOTE_DIR:?FTP_REMOTE_DIR が未設定です}"

DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
fi

if grep -q "GTM-XXXXXXX" site/config.js; then
  echo "警告: site/config.js がまだプレースホルダのGTM IDのままです。"
  read -r -p "本当に転送しますか？ [y/N] " confirm
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "中止しました。"
    exit 1
  fi
fi

LFTP_CMD="mirror -R --delete --verbose site/ '${FTP_REMOTE_DIR}'"
if [ "$DRY_RUN" = true ]; then
  LFTP_CMD="${LFTP_CMD} --dry-run"
fi

lftp -u "${FTP_USER},${FTP_PASS}" "ftps://${FTP_HOST}" -e "${LFTP_CMD}; bye"
