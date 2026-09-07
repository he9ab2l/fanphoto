#!/usr/bin/env bash
# Run on ten after inspecting the exact old service and directory.
# Only the known FanPhoto deployment is retired; all data is recoverable.
set -euo pipefail
fanphoto_old=/home/ubuntu/fanphoto-dev
fanphoto_new=/home/ubuntu/fanphoto-next
if [[ ! -d "$fanphoto_old" ]]; then
  printf 'Known legacy directory is already absent.\n'
  exit 0
fi
test "$(readlink -f "$fanphoto_old")" = /home/ubuntu/fanphoto-dev
test -f "$fanphoto_new/.env"
test -f "$fanphoto_new/workspace/apps/server/dist/server.mjs"
test -f "$fanphoto_new/workspace/apps/client/dist/index.html"
fanphoto_working=$(systemctl show fanphoto-dev.service --property=WorkingDirectory --value)
test "$fanphoto_working" = /home/ubuntu/fanphoto-dev/current
fanphoto_containers=$(docker ps -a --format '{{.Names}}' | awk '/^fanphoto($|[-_])/ {print}')
if [[ -n "$fanphoto_containers" ]]; then
  printf 'Unexpected FanPhoto containers need individual inspection before cleanup.\n' >&2
  exit 1
fi
mkdir -p /home/ubuntu/fanphoto-archive
fanphoto_archive=$(mktemp -d /home/ubuntu/fanphoto-archive/legacy.XXXXXX)
chmod 700 "$fanphoto_archive"
sudo -n cp -p /etc/caddy/Caddyfile "$fanphoto_archive/Caddyfile.before"
sudo -n cp -p /etc/systemd/system/fanphoto-dev.service "$fanphoto_archive/fanphoto-dev.service"
docker ps --format '{{.ID}} {{.Names}} {{.Image}} {{.State}}' >"$fanphoto_archive/containers.before.txt"
node "$fanphoto_new/workspace/deploy/caddy-config.mjs" /etc/caddy/Caddyfile "$fanphoto_archive/Caddyfile.next"
sudo -n caddy validate --config "$fanphoto_archive/Caddyfile.next" --adapter caddyfile
sudo -n systemctl disable --now fanphoto-dev.service
if ss -ltnH 'sport = :8787' | awk 'END {exit NR > 0 ? 0 : 1}'; then
  printf 'Port 8787 remains occupied; refusing to move the legacy directory.\n' >&2
  exit 1
fi
mv "$fanphoto_old" "$fanphoto_archive/deployment"
sudo -n mv /etc/systemd/system/fanphoto-dev.service "$fanphoto_archive/retired-unit.service"
sudo -n systemctl daemon-reload
sudo -n install -m 644 "$fanphoto_archive/Caddyfile.next" /etc/caddy/Caddyfile
sudo -n systemctl reload caddy
docker ps --format '{{.ID}} {{.Names}} {{.Image}} {{.State}}' >"$fanphoto_archive/containers.after.txt"
diff -u "$fanphoto_archive/containers.before.txt" "$fanphoto_archive/containers.after.txt"
printf 'Legacy source, builds, data and service archived at: %s\n' "$fanphoto_archive"
printf 'No legacy nginx directory or FanPhoto containers were present; shared services were preserved.\n'
