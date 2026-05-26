# InstantClothDelivery (ThreadDash)

An on-demand clothing delivery platform with a **Try Before You Keep** feature. Customers browse a catalog, place orders, and a delivery agent brings items to their door — with a 30-minute trial window to decide what to keep.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Prerequisites](#prerequisites)
4. [First-Time Setup](#first-time-setup)
5. [Running the Project](#running-the-project)
6. [Mobile App Setup](#mobile-app-setup)
7. [Service Port Map](#service-port-map)
8. [Environment Variables](#environment-variables)
9. [Database](#database)
10. [Order Status Flow](#order-status-flow)
11. [Project Structure](#project-structure)
12. [Testing](#testing)
13. [Common Issues](#common-issues)

---

## Architecture Overview

```
Customer App (Expo)        Agent App (Expo)
        │                        │
        └──────────┬─────────────┘
                   ▼
            API Gateway :3000
                   │
    ┌──────────────┼──────────────┬──────────────┐
    ▼              ▼              ▼              ▼
Order Svc    Agent Svc    Warehouse Svc    Payment Svc
  :3001        :3006          :3002           :3004
    │              │
    └──────┬───────┘
           ▼
       RabbitMQ (events)
           │
    ┌──────┴──────────┐
    ▼                 ▼
Realtime Svc    Notification Svc
  :3005              :3003
    │
    ▼ (Socket.IO)
Customer App (live order tracking)

Routing Svc :8000  ← Python/FastAPI, warehouse selection & agent scoring
```

**Key event flows:**
- `order.placed` → agent-service assigns an agent and auto-progresses order through warehouse states
- `order.status_changed` → realtime-service broadcasts to customer's socket room (live timeline)
- `assignment.status_changed` → notification-service alerts the assigned agent

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile apps | React Native + Expo Router |
| Backend services | Node.js + Express + TypeScript |
| Routing service | Python 3.11 + FastAPI |
| Database | PostgreSQL 16 with PostGIS (Docker) |
| ORM | Prisma |
| Cache | Redis 7 (Docker) |
| Message broker | RabbitMQ 3.13 (Docker) |
| Real-time | Socket.IO |
| Monorepo tooling | npm workspaces + Turborepo |

---

## Prerequisites

Install these before anything else:

- **Node.js >= 20** — [nodejs.org](https://nodejs.org)
- **Python 3.11+** — [python.org](https://python.org)
- **Docker Desktop** — [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
- **Expo Go** app on your iOS or Android device (for running mobile apps on a physical device)

Verify:
```bash
node --version    # must be >= 20
python3 --version # must be >= 3.11
docker --version
```

---

## First-Time Setup

### 1. Clone and install Node dependencies

```bash
git clone https://github.com/vaayum/InstantClothDelivery.git
cd InstantClothDelivery
npm install
```

### 2. Start infrastructure containers

```bash
docker compose up -d postgres redis rabbitmq
```

Wait until all three containers are healthy:

```bash
docker ps
# STATUS column should show "(healthy)" for threaddash_postgres, threaddash_redis, threaddash_rabbitmq
```

### 3. Run database migrations and generate Prisma client

```bash
bash infrastructure/scripts/setup-dev.sh
```

This script waits for Postgres, applies all Prisma migrations, and generates the Prisma client. You only need to run it once (and again after pulling schema changes).

### 4. Set up the Python routing service

```bash
cd services/routing-service
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

---

## Running the Project

Start each service in a **separate terminal tab**. All Node services must be running for the full flow to work.

### Infrastructure (must be running first)

```bash
docker compose up -d postgres redis rabbitmq
```

### Node services

```bash
# Terminal 1
npm run dev --workspace=services/api-gateway

# Terminal 2
npm run dev --workspace=services/order-service

# Terminal 3
npm run dev --workspace=services/agent-service

# Terminal 4
npm run dev --workspace=services/warehouse-service

# Terminal 5
npm run dev --workspace=services/payment-service

# Terminal 6
npm run dev --workspace=services/realtime-service

# Terminal 7 (optional — push notifications)
npm run dev --workspace=services/notification-service
```

### Python routing service

```bash
# Terminal 8
cd services/routing-service
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

### Verify all services are up

```bash
for port in 3000 3001 3002 3004 3005 3006 8000; do
  echo -n "Port $port: "
  curl -s http://localhost:$port/health
  echo
done
```

All should return `{"status":"ok",...}`.

> **Note on `npm run dev` from root:** Turborepo can run all Node services with one command, but if any Expo app fails to start (e.g. port already in use), it aborts everything. Starting services individually is more reliable during development.

---

## Mobile App Setup

Mobile apps connect to the backend over your **local network IP** — not `localhost`, because on a physical device `localhost` refers to the phone itself, not your machine.

### 1. Find your machine's local IP

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'

# Windows
ipconfig | findstr "IPv4"
```

Example: `192.168.1.42`

### 2. Configure the Customer App

Create `apps/customer-app/.env`:

```env
EXPO_PUBLIC_API_URL=http://<YOUR_LOCAL_IP>:3000
EXPO_PUBLIC_REALTIME_URL=http://<YOUR_LOCAL_IP>:3005
```

Start:

```bash
cd apps/customer-app && npx expo start --port 8083
```

### 3. Configure the Agent App

Create `apps/agent-app/.env`:

```env
EXPO_PUBLIC_API_URL=http://<YOUR_LOCAL_IP>:3000
```

Start:

```bash
cd apps/agent-app && npx expo start --port 8082
```

Scan the QR code with **Expo Go**, or press `i` (iOS simulator) / `a` (Android emulator) in the terminal.

### 4. Web apps (optional)

```bash
# Warehouse staff dashboard — http://localhost:5173
npm run dev --workspace=apps/warehouse-web

# Admin panel — http://localhost:5174
npm run dev --workspace=apps/admin-dashboard
```

---

## Service Port Map

| Service | Port | Notes |
|---|---|---|
| API Gateway | 3000 | Single entry point for all client traffic |
| Order Service | 3001 | Orders, catalog, trials, SLA monitoring |
| Warehouse Service | 3002 | Inventory, picking tasks |
| Notification Service | 3003 | Push notifications via FCM |
| Payment Service | 3004 | Payments, COD, no-show charges |
| Realtime Service | 3005 | Socket.IO live order tracking |
| Agent Service | 3006 | Assignments, delivery actions |
| Routing Service | 8000 | Warehouse selection & agent scoring (Python) |
| Warehouse Web | 5173 | Vite — warehouse staff UI |
| Admin Dashboard | 5174 | Vite — admin panel |
| PostgreSQL | 5432 | Main database |
| Redis | **6380** | Mapped from internal 6379 to avoid local conflicts |
| RabbitMQ | 5672 | AMQP |
| RabbitMQ Management UI | 15672 | [http://localhost:15672](http://localhost:15672) — `guest / guest` |

---

## Environment Variables

Services work with defaults out of the box when using the Docker Compose setup. The only **required** configuration is setting `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_REALTIME_URL` in the mobile app `.env` files (see [Mobile App Setup](#mobile-app-setup)).

For non-default ports or remote databases, create a `.env` in the service directory. Example for `services/order-service/.env`:

```env
DATABASE_URL=postgresql://threaddash:password@localhost:5432/threaddash_dev
REDIS_URL=redis://localhost:6380
RABBITMQ_URL=amqp://guest:guest@localhost:5672
ORDER_SERVICE_PORT=3001
WAREHOUSE_SERVICE_URL=http://localhost:3002
ROUTING_SERVICE_URL=http://localhost:8000
PAYMENT_SERVICE_URL=http://localhost:3004
```

> **Redis port:** Docker maps Redis to `6380` on the host (internal port stays 6379). Always use `6380` in your `REDIS_URL`.

---

## Database

### Common commands

```bash
# Apply pending migrations
npm run db:migrate

# Regenerate Prisma client after schema changes
npm run db:generate

# Open Prisma Studio (visual table browser)
npm run db:studio

# Full reset — drops all data and re-runs migrations
cd packages/database && npx prisma migrate reset
```

### Seeded test accounts

The setup script seeds the database with products, warehouses, zones, and two test users:

| Phone | Role |
|---|---|
| +919876500001 | CUSTOMER |
| +919999999999 | CUSTOMER |

**How OTP login works in dev:** Call `POST /auth/send-otp` with the phone number, then read the OTP directly from Redis:

```bash
# 1. Trigger OTP generation
curl -X POST http://localhost:3000/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876500001"}'

# 2. Read the OTP from Redis
docker exec threaddash_redis redis-cli GET "otp:+919876500001"

# 3. Verify and get a token
curl -X POST http://localhost:3000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876500001","otp":"<OTP_FROM_STEP_2>"}'
```

---

## Order Status Flow

```
PENDING
  ├── CANCELLED  (customer cancels, or payment fails)
  └── WAREHOUSE_PROCESSING  ← auto-set by agent-service consumer (~1s after order placed)
        └── READY_FOR_PICKUP  ← auto (~3s)
              └── AGENT_ASSIGNED  ← auto (~5s, once an available agent is found)
                    ├── RESCHEDULED → AGENT_ASSIGNED  (re-queued after reschedule)
                    └── AGENT_EN_ROUTE  (agent picks up from warehouse)
                          └── ARRIVED  (agent at customer's door)
                                ├── TRIAL_IN_PROGRESS  (try-orders: 30-min trial starts)
                                │     └── DELIVERED / PARTIALLY_DELIVERED / RETURNED
                                └── DELIVERED  (non-try orders, direct delivery)
```

**Try-order outcome logic** (owned by order-service `/internal/orders/:id/finalize`):
- All items KEPT → `DELIVERED`
- Some KEPT, some RETURNED → `PARTIALLY_DELIVERED`
- All RETURNED → `RETURNED`

---

## Project Structure

```
InstantClothDelivery/
├── apps/
│   ├── customer-app/         # React Native — customer mobile app (Expo)
│   ├── agent-app/            # React Native — delivery agent app (Expo)
│   ├── warehouse-web/        # Vite — warehouse staff dashboard
│   └── admin-dashboard/      # Vite — admin panel
│
├── services/
│   ├── api-gateway/          # Reverse proxy + auth enforcement
│   ├── order-service/        # Orders, catalog, trial management, SLA
│   ├── agent-service/        # Agent assignments, delivery action endpoints
│   ├── warehouse-service/    # Inventory reservation/release, picking tasks
│   ├── payment-service/      # Payments, COD recording, no-show charges
│   ├── realtime-service/     # Socket.IO server + RabbitMQ consumer
│   ├── notification-service/ # Push notifications (FCM)
│   └── routing-service/      # Python/FastAPI — warehouse selection, agent scoring
│
├── packages/
│   ├── auth/                 # Shared JWT middleware  (@threaddash/auth)
│   ├── database/             # Prisma schema + migrations  (@threaddash/database)
│   └── shared-types/         # Shared TypeScript types  (@threaddash/shared-types)
│
├── infrastructure/
│   ├── docker-compose.yml    # Postgres, Redis, RabbitMQ, OSRM
│   └── scripts/
│       └── setup-dev.sh      # First-time setup script
│
├── turbo.json                # Turborepo pipeline config
└── package.json              # npm workspaces root
```

---

## Testing

```bash
# All tests
npm run test

# Single service
npm run test --workspace=services/order-service

# TypeScript check across entire monorepo
npm run typecheck
```

---

## Common Issues

**Port already in use**
```bash
# Replace 3001 with the port that's occupied
lsof -ti:3001 | xargs kill -9
```

**Order stuck at "Ready for Pickup" — no agent assigned**

There are 2 seeded agents; one is `OFF_DUTY` by default. Reset all agents to AVAILABLE:
```bash
docker exec threaddash_postgres psql -U threaddash -d threaddash_dev \
  -c "UPDATE agents SET status='AVAILABLE';"
```

**Expo app shows blank screen or "Network request failed"**

`localhost` does not work on a physical device. Set `EXPO_PUBLIC_API_URL` in `apps/customer-app/.env` (and `apps/agent-app/.env`) to your machine's local network IP — see [Mobile App Setup](#mobile-app-setup).

**Prisma "Can't reach database server"**

Postgres container may not be running:
```bash
docker compose up -d postgres
# Wait ~10s for it to become healthy, then retry
```

**RabbitMQ consumer fails to connect on service start**

Start infrastructure before services. If RabbitMQ is still booting, the service will crash. Confirm it's healthy first:
```bash
docker exec threaddash_rabbitmq rabbitmq-diagnostics ping
```

**Redis "connection refused"**

Redis is mapped to port **6380** (not the default 6379). Check that `REDIS_URL=redis://localhost:6380` in your service `.env`, or that no custom config overrides the default.
