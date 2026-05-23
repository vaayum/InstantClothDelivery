# InstantClothDelivery

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools directly.

### Available gstack skills

/office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /setup-gbrain, /retro, /investigate, /document-release, /document-generate, /codex, /cso, /autoplan, /plan-devex-review, /devex-review, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn

## ThreadDash — Build & Dev Commands

### Prerequisites
- Node.js >= 20, Python 3.11+
- Docker (for Postgres, Redis, RabbitMQ)

### First-time setup
```bash
bash infrastructure/scripts/setup-dev.sh   # start infra + run DB migrations
npm install                                 # install all workspace deps
```

### Dev (all services in parallel)
```bash
npm run dev          # turbo: starts all Node services + web apps
```

### Individual service dev
```bash
cd services/routing-service && uvicorn main:app --reload --port 8000
cd apps/customer-app && npm run dev        # Expo — customer mobile app
cd apps/agent-app && npm run dev           # Expo — agent mobile app
cd apps/warehouse-web && npm run dev       # Vite — warehouse web (port 5173)
cd apps/admin-dashboard && npm run dev     # Vite — admin dashboard (port 5174)
```

### Database
```bash
npm run db:migrate   # run Prisma migrations
npm run db:generate  # regenerate Prisma client
npm run db:studio    # open Prisma Studio
```

### Build & typecheck
```bash
npm run build        # build all packages/services
npm run typecheck    # TypeScript check across monorepo
```

### Local infra (Docker)
```bash
docker compose up -d postgres redis rabbitmq   # start core services
# RabbitMQ Management UI: http://localhost:15672 (guest/guest)
```

## Service Port Map
| Service              | Port |
|---------------------|------|
| API Gateway         | 3000 |
| Order Service       | 3001 |
| Warehouse Service   | 3002 |
| Routing Service     | 8000 |
| Notification Service| 3003 |
| Payment Service     | 3004 |
| Realtime Service    | 3005 |
| Warehouse Web       | 5173 |
| Admin Dashboard     | 5174 |
