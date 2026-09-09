#!/usr/bin/env bash
# Immutable releases. Source and data are separate. Run from the new workspace.
set -euo pipefail
fanphoto_root=/home/ubuntu/fanphoto-next
cd "$fanphoto_root/workspace"
test -f "$fanphoto_root/.env"
mkdir -p "$fanphoto_root/releases" "$fanphoto_root/data"
exec 9>"$fanphoto_root/release.lock"
flock -n 9
pnpm install --frozen-lockfile
pnpm build
pnpm test
if systemctl is-active --quiet fanphoto-dev.service; then
  printf 'Run the scoped legacy cleanup before publishing the new application.\n' >&2
  exit 1
fi
if [[ -e "$fanphoto_root/current" && ! -L "$fanphoto_root/current" ]]; then
  printf 'current must be a symlink, refusing to overwrite.\n' >&2
  exit 1
fi
fanphoto_previous=$(readlink "$fanphoto_root/current" || true)
fanphoto_release=$(mktemp -d "$fanphoto_root/releases/release.XXXXXX")
mkdir -p "$fanphoto_release/apps/client"
pnpm --filter @fanphoto/server deploy --prod "$fanphoto_release/apps/server"
cp -a apps/client/dist "$fanphoto_release/apps/client/dist"
if [[ -f "$fanphoto_root/data/library.sqlite" ]]; then
  if systemctl is-active --quiet fanphoto.service; then
    sudo -n systemctl stop fanphoto.service
  fi
  FANPHOTO_ENV_FILE="$fanphoto_root/.env" pnpm backup
fi
ln -s "$fanphoto_release" "$fanphoto_release.next"
mv -Tf "$fanphoto_release.next" "$fanphoto_root/current"
sudo -n install -m 644 deploy/fanphoto.service /etc/systemd/system/fanphoto.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable fanphoto.service
sudo -n systemctl restart fanphoto.service
for fanphoto_attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 3 http://127.0.0.1:8787/api/health >/dev/null &&
    curl -fsS --max-time 3 http://127.0.0.1:8787/ >/dev/null; then
    printf 'New release is healthy: %s\n' "$fanphoto_release"
    exit 0
  fi
  sleep 1
done
if [[ -n "$fanphoto_previous" ]]; then
  ln -s "$fanphoto_previous" "$fanphoto_release.rollback"
  mv -Tf "$fanphoto_release.rollback" "$fanphoto_root/current"
  sudo -n systemctl restart fanphoto.service
  printf 'Health check failed, restored previous new-architecture release.\n' >&2
else
  sudo -n systemctl stop fanphoto.service
  printf 'First release failed health checks; stopped, data remains intact.\n' >&2
fi
exit 1
