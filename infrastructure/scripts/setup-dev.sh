#!/usr/bin/env bash
set -e
echo "=== ThreadDash dev setup ==="

docker compose up -d postgres redis rabbitmq
echo "Waiting for Postgres..."
until docker exec threaddash_postgres pg_isready -U threaddash 2>/dev/null; do sleep 1; done

cd packages/database
npx prisma generate
npx prisma migrate dev --name init
cd ../..

echo ""
echo "Ready!"
echo "  Postgres:  localhost:5432"
echo "  Redis:     localhost:6379"
echo "  RabbitMQ:  localhost:5672  (UI -> http://localhost:15672)"
echo ""
echo "Start services:"
echo "  npm run dev"
