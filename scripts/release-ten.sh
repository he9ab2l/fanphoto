#!/usr/bin/env bash
# Run on ten, from the synchronized source workspace. Does not edit Caddy or DNS.
set -euo pipefail
fanphoto_root=/home/ubuntu/fanphoto-dev
cd "$fanphoto_root/workspace"
test -f "$fanphoto_root/.env"
pnpm install --frozen-lockfile
pnpm test
pnpm build
if test -f "$fanphoto_root/data/fanphoto.sqlite"; then
  FANPHOTO_ENV_FILE="$fanphoto_root/.env" pnpm backup
fi
mkdir -p "$fanphoto_root/releases" "$fanphoto_root/data"
if test -e "$fanphoto_root/current" && ! test -L "$fanphoto_root/current"; then
  printf 'Refusing to replace a non-symlink current path.\n' >&2
  exit 1
fi
fanphoto_previous=$(readlink "$fanphoto_root/current" || true)
fanphoto_release=$(mktemp -d "$fanphoto_root/releases/release.XXXXXX")
mkdir -p "$fanphoto_release/apps/web" "$fanphoto_release/apps/api/dist"
cp -a apps/web/dist "$fanphoto_release/apps/web/"
cp -a apps/api/migrations "$fanphoto_release/apps/api/"
cp apps/api/dist/server.mjs "$fanphoto_release/apps/api/dist/server.mjs"
ln -s "$fanphoto_release" "$fanphoto_release.link"
mv -Tf "$fanphoto_release.link" "$fanphoto_root/current"
sudo -n install -m 644 deploy/fanphoto-dev.service /etc/systemd/system/fanphoto-dev.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable fanphoto-dev.service
sudo -n systemctl restart fanphoto-dev.service
for fanphoto_attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 2 http://127.0.0.1:8787/api/health >/dev/null; then
    printf 'Release healthy: %s\nPrevious release: %s\n' "$fanphoto_release" "$fanphoto_previous"
    exit 0
  fi
  sleep 1
done
if test -n "$fanphoto_previous"; then
  ln -s "$fanphoto_previous" "$fanphoto_release.rollback-link"
  mv -Tf "$fanphoto_release.rollback-link" "$fanphoto_root/current"
  sudo -n systemctl restart fanphoto-dev.service
  printf 'Health check failed; restored previous release.\n' >&2
else
  sudo -n systemctl stop fanphoto-dev.service
  printf 'Health check failed; first deployment stopped.\n' >&2
fi
exit 1
