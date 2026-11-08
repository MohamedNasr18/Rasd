#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "Applying database migrations..."
  npx prisma migrate deploy
fi

exec node dist/main.js
