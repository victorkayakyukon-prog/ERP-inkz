#!/usr/bin/env bash
# Runs once when the codespace is created: install, migrate, seed.
set -euo pipefail

echo "==> Installing dependencies"
npm install

echo "==> Writing server/.env"
cp -n server/.env.example server/.env 2>/dev/null || true
# The database lives in a sibling container called "db".
sed -i 's#^DATABASE_URL=.*#DATABASE_URL="postgresql://postgres:postgres@db:5432/signshop?schema=public"#' server/.env

echo "==> Generating the Prisma client"
npx prisma generate --schema server/prisma/schema.prisma

echo "==> Waiting for Postgres"
for attempt in $(seq 1 30); do
  if npm run db:migrate >/dev/null 2>&1; then
    echo "    schema applied"
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "    database did not come up in time — run 'npm run db:migrate' by hand"
    exit 0
  fi
  sleep 2
done

echo "==> Loading demo data"
npm run db:seed

echo
echo "Ready. Run 'npm run dev' and open the forwarded port 5173."
echo "Sign in with admin@inkzsigns.test / password123"
