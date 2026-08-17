#!/bin/bash
# Platform container entrypoint: install dependencies into the mounted
# repository if they are missing or stale, seed the database (idempotent),
# then start the service.
set -euo pipefail
cd /app

install_if_needed() {
  local dir="$1"
  if [ ! -d "$dir/node_modules" ] || [ "$dir/package-lock.json" -nt "$dir/node_modules" ]; then
    echo "installing dependencies in $dir …"
    (cd "$dir" && npm ci --no-audit --no-fund)
  fi
}

install_if_needed .              # renderer + gates (root package)
install_if_needed apps/platform
install_if_needed apps/admin

# node:sqlite needs the experimental flag on Node 22; later majors ship
# it unflagged and reject the flag, so detect instead of hard-coding.
NODE_FLAGS=""
if ! node -e "import('node:sqlite').then(() => process.exit(0), () => process.exit(1))" 2>/dev/null; then
  NODE_FLAGS="--experimental-sqlite"
fi

echo "seeding (idempotent) …"
node $NODE_FLAGS deploy/seed.mjs

echo "starting platform …"
exec node $NODE_FLAGS apps/platform/src/server.js
