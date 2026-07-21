#!/bin/sh
set -e

echo "Aplicando migrations do banco..."
npx prisma migrate deploy

exec "$@"
