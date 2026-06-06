#!/bin/sh
set -e

if [ "${RUN_PRISMA_MIGRATIONS:-true}" != "false" ]; then
  npx prisma migrate deploy
fi

exec "$@"
