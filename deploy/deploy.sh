#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

echo "==> Pull latest changes"
git pull

echo "==> Reset installed dependencies"
rm -rf node_modules

echo "==> Install dependencies"
npm install

echo "==> Generate Prisma client"
npm run prisma:generate

echo "==> Apply Prisma schema with db push"
npm run prisma:push

echo "==> Build application"
npm run build

echo "==> Restart PM2 process"
pm2 restart tariffcalc-api --update-env

echo "==> Check local health"
curl --fail --show-error --silent http://127.0.0.1:9099/health
echo

echo "==> Check public health"
curl --fail --show-error --silent https://api.calc.dvtransport.ru/health
echo

echo "==> Deploy completed"
