# Phase 1 — Order State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full order lifecycle in order-service and warehouse-service: place order → warehouse reserve → state transitions → trial → complete, all producing RabbitMQ events.

**Architecture:** order-service owns the state machine and all order routes; warehouse-service owns atomic inventory operations; routing-service (Python/FastAPI, already implemented) selects the nearest warehouse by Haversine score. A single `transitionOrder()` function is the only place that writes `orders.status`. SLA timers run as a node-cron job inside order-service.

**Tech Stack:** Express + TypeScript, Prisma 5, ioredis, amqplib, axios, node-cron, Jest + ts-jest + supertest; FastAPI + pytest for routing-service tests.

---

## File Map

### warehouse-service
| Action | Path |
|--------|------|
| Modify | `services/warehouse-service/package.json` |
| Create | `services/warehouse-service/jest.config.js` |
| Create | `services/warehouse-service/src/lib/db.ts` |
| Create | `services/warehouse-service/src/routes/inventory.ts` |
| Modify | `services/warehouse-service/src/index.ts` |
| Create | `services/warehouse-service/tests/inventory.test.ts` |

### routing-service (tests only — implementation already exists)
| Action | Path |
|--------|------|
| Modify | `services/routing-service/requirements.txt` |
| Create | `services/routing-service/test_routing.py` |

### order-service
| Action | Path |
|--------|------|
| Modify | `services/order-service/package.json` |
| Create | `services/order-service/jest.config.js` |
| Create | `services/order-service/src/lib/db.ts` |
| Create | `services/order-service/src/lib/redis.ts` |
| Create | `services/order-service/src/lib/rabbitmq.ts` |
| Create | `services/order-service/src/transitions.ts` |
| Create | `services/order-service/src/routes/orders.ts` |
| Create | `services/order-service/src/routes/trial.ts` |
| Create | `services/order-service/src/sla-monitor.ts` |
| Modify | `services/order-service/src/index.ts` |
| Create | `services/order-service/tests/transitions.test.ts` |
| Create | `services/order-service/tests/orders.test.ts` |
| Create | `services/order-service/tests/trial.test.ts` |
| Create | `services/order-service/tests/sla-monitor.test.ts` |

---

## Task 1: Dev infrastructure — package.json + jest configs

**Files:**
- Modify: `services/order-service/package.json`
- Modify: `services/warehouse-service/package.json`
- Create: `services/order-service/jest.config.js`
- Create: `services/warehouse-service/jest.config.js`

- [ ] **Step 1: Update order-service/package.json**

Replace the full file with:

```json
{
  "name": "@threaddash/order-service",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "jest --no-coverage"
  },
  "dependencies": {
    "@threaddash/auth": "*",
    "@threaddash/shared-types": "*",
    "@prisma/client": "^5.14.0",
    "express": "^4.19.0",
    "amqplib": "^0.10.0",
    "ioredis": "^5.4.0",
    "axios": "^1.7.0",
    "node-cron": "^3.0.0",
    "dotenv": "^16.4.0",
    "winston": "^3.13.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/amqplib": "^0.10.0",
    "@types/node": "^20.0.0",
    "@types/node-cron": "^3.0.0",
    "@types/jest": "^29.0.0",
    "@types/supertest": "^6.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "supertest": "^7.0.0",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Update warehouse-service/package.json**

Replace the full file with:

```json
{
  "name": "@threaddash/warehouse-service",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "jest --no-coverage"
  },
  "dependencies": {
    "@threaddash/auth": "*",
    "@threaddash/shared-types": "*",
    "@prisma/client": "^5.14.0",
    "express": "^4.19.0",
    "amqplib": "^0.10.0",
    "ioredis": "^5.4.0",
    "dotenv": "^16.4.0",
    "winston": "^3.13.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/amqplib": "^0.10.0",
    "@types/node": "^20.0.0",
    "@types/jest": "^29.0.0",
    "@types/supertest": "^6.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "supertest": "^7.0.0",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3: Run npm install from monorepo root**

```bash
npm install
```

Expected: no errors.

- [ ] **Step 4: Create order-service/jest.config.js**

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^@threaddash/auth$": "<rootDir>/../../packages/auth/src/index.ts",
  },
  globals: {
    "ts-jest": {
      diagnostics: false,
    },
  },
};
```

- [ ] **Step 5: Create warehouse-service/jest.config.js**

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^@threaddash/auth$": "<rootDir>/../../packages/auth/src/index.ts",
  },
  globals: {
    "ts-jest": {
      diagnostics: false,
    },
  },
};
```

- [ ] **Step 6: Verify jest is wired**

```bash
cd services/order-service && npx jest --listTests 2>&1
cd services/warehouse-service && npx jest --listTests 2>&1
```

Expected: no error (empty list is fine — no tests yet).

- [ ] **Step 7: Commit**

```bash
git add services/order-service/package.json services/warehouse-service/package.json \
        services/order-service/jest.config.js services/warehouse-service/jest.config.js \
        package-lock.json
git commit -m "feat(phase1): add jest/axios/node-cron deps to order+warehouse services"
```

---

## Task 2: Shared lib files — db, redis, rabbitmq singletons

**Files:**
- Create: `services/order-service/src/lib/db.ts`
- Create: `services/order-service/src/lib/redis.ts`
- Create: `services/order-service/src/lib/rabbitmq.ts`
- Create: `services/warehouse-service/src/lib/db.ts`

No tests needed for these — they are thin singletons tested implicitly through route tests.

- [ ] **Step 1: Create order-service/src/lib/db.ts**

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ["error"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export function getPrisma(): PrismaClient {
  return prisma;
}
```

- [ ] **Step 2: Create order-service/src/lib/redis.ts**

```typescript
import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380");
  }
  return client;
}
```

- [ ] **Step 3: Create order-service/src/lib/rabbitmq.ts**

```typescript
import amqp from "amqplib";
import type { Channel } from "amqplib";

let channel: Channel | null = null;

export async function getChannel(): Promise<Channel> {
  if (!channel) {
    const conn = await amqp.connect(
      process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672"
    );
    channel = await conn.createChannel();
    await channel.assertExchange("threaddash", "topic", { durable: true });
  }
  return channel;
}

export async function publishEvent(routingKey: string, payload: object): Promise<void> {
  const ch = await getChannel();
  ch.publish(
    "threaddash",
    routingKey,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true }
  );
}
```

- [ ] **Step 4: Create warehouse-service/src/lib/db.ts**

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ["error"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export function getPrisma(): PrismaClient {
  return prisma;
}
```

- [ ] **Step 5: Typecheck both services**

```bash
cd services/order-service && npx tsc --noEmit
cd services/warehouse-service && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add services/order-service/src/lib/ services/warehouse-service/src/lib/db.ts
git commit -m "feat(phase1): add db/redis/rabbitmq singletons for order+warehouse services"
```

---

## Task 3: Routing service pytest tests

The routing service at `services/routing-service/main.py` is already fully implemented. This task only adds tests.

**Files:**
- Modify: `services/routing-service/requirements.txt`
- Create: `services/routing-service/test_routing.py`

- [ ] **Step 1: Add pytest to requirements.txt**

```
fastapi>=0.111.0
uvicorn[standard]>=0.30.0
httpx>=0.27.0
pydantic>=2.7.0
python-dotenv>=1.0.0
pytest>=8.2.0
```

- [ ] **Step 2: Install dependencies**

```bash
cd services/routing-service && pip install -r requirements.txt
```

Expected: `Successfully installed pytest-X.X.X` in output.

- [ ] **Step 3: Write tests**

Create `services/routing-service/test_routing.py`:

```python
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

WAREHOUSE_HSR = {
    "warehouse_id": "wh-hsr",
    "lat": 12.9116,
    "lng": 77.6389,
    "active_order_count": 0,
    "has_stock": True,
}
WAREHOUSE_INDIRANAGAR = {
    "warehouse_id": "wh-indiranagar",
    "lat": 12.9784,
    "lng": 77.6408,
    "active_order_count": 0,
    "has_stock": True,
}
CUSTOMER_KORAMANGALA = {"lat": 12.9352, "lng": 77.6245}


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_select_warehouse_returns_nearest():
    # HSR (12.9116, 77.6389) is closer to Koramangala than Indiranagar (12.9784, 77.6408)
    res = client.post(
        "/select-warehouse",
        json={
            "delivery_coords": CUSTOMER_KORAMANGALA,
            "warehouses": [WAREHOUSE_HSR, WAREHOUSE_INDIRANAGAR],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["warehouse_id"] == "wh-hsr"
    assert body["eta_minutes"] > 0
    assert body["score"] > 0


def test_select_warehouse_no_stock_excluded():
    res = client.post(
        "/select-warehouse",
        json={
            "delivery_coords": CUSTOMER_KORAMANGALA,
            "warehouses": [
                {**WAREHOUSE_HSR, "has_stock": False},
                {**WAREHOUSE_INDIRANAGAR, "has_stock": False},
            ],
        },
    )
    assert res.status_code == 200
    assert res.json()["warehouse_id"] is None
    assert res.json()["error"] == "no_warehouse_available"


def test_select_warehouse_outside_radius_excluded():
    far_warehouse = {
        "warehouse_id": "wh-far",
        "lat": 13.3528,
        "lng": 77.1018,
        "active_order_count": 0,
        "has_stock": True,
    }
    res = client.post(
        "/select-warehouse",
        json={
            "delivery_coords": CUSTOMER_KORAMANGALA,
            "warehouses": [far_warehouse],
        },
    )
    assert res.status_code == 200
    assert res.json()["warehouse_id"] is None


def test_assign_agent_returns_scored_candidates():
    WAREHOUSE_COORDS = {"lat": 12.9116, "lng": 77.6389}
    CUSTOMER_COORDS = {"lat": 12.9352, "lng": 77.6245}
    res = client.post(
        "/assign-agent",
        json={
            "warehouse_coords": WAREHOUSE_COORDS,
            "delivery_coords": CUSTOMER_COORDS,
            "agents": [
                {
                    "agent_id": "agent-1",
                    "lat": 12.9200,
                    "lng": 77.6300,
                    "current_order_count": 0,
                    "max_concurrent": 3,
                },
                {
                    "agent_id": "agent-2",
                    "lat": 12.9900,
                    "lng": 77.7000,
                    "current_order_count": 0,
                    "max_concurrent": 3,
                },
            ],
        },
    )
    assert res.status_code == 200
    candidates = res.json()["candidates"]
    assert len(candidates) == 2
    # Results must be sorted by ascending score
    assert candidates[0]["score"] <= candidates[1]["score"]


def test_assign_agent_no_eligible_agents():
    res = client.post(
        "/assign-agent",
        json={
            "warehouse_coords": {"lat": 12.9116, "lng": 77.6389},
            "delivery_coords": {"lat": 12.9352, "lng": 77.6245},
            "agents": [
                {
                    "agent_id": "agent-far",
                    "lat": 13.3528,
                    "lng": 77.1018,
                    "current_order_count": 0,
                    "max_concurrent": 3,
                }
            ],
        },
    )
    assert res.status_code == 200
    assert res.json()["error"] == "no_agent_available"
```

- [ ] **Step 4: Run tests**

```bash
cd services/routing-service && pytest test_routing.py -v
```

Expected: all 6 tests PASS. If any fail due to assertion mismatch, update the assertion — the implementation is authoritative.

- [ ] **Step 5: Commit**

```bash
git add services/routing-service/requirements.txt services/routing-service/test_routing.py
git commit -m "test(routing-service): add pytest suite for warehouse selection and agent assignment"
```

---

## Task 4: Warehouse inventory endpoints

**Files:**
- Create: `services/warehouse-service/src/routes/inventory.ts`
- Modify: `services/warehouse-service/src/index.ts`
- Create: `services/warehouse-service/tests/inventory.test.ts`

- [ ] **Step 1: Write failing tests**

Create `services/warehouse-service/tests/inventory.test.ts`:

```typescript
jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));

import request from "supertest";
import { getPrisma } from "../src/lib/db";

let app: any;
beforeAll(async () => {
  app = (await import("../src/index")).default;
});

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;

const mockTx = {
  inventory: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};
const mockPrisma = {
  $transaction: jest.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPrisma.mockReturnValue(mockPrisma as any);
});

describe("POST /inventory/reserve", () => {
  it("returns 200 and decrements availability on sufficient stock", async () => {
    mockTx.inventory.findUnique.mockResolvedValue({
      quantityAvailable: 8,
      quantityReserved: 0,
    });
    mockTx.inventory.update.mockResolvedValue({});

    const res = await request(app)
      .post("/inventory/reserve")
      .send({
        orderId: "order-abc",
        items: [{ skuId: "sku-os-s", warehouseId: "wh-hsr", quantity: 2 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockTx.inventory.update).toHaveBeenCalledWith({
      where: { skuId_warehouseId: { skuId: "sku-os-s", warehouseId: "wh-hsr" } },
      data: {
        quantityAvailable: { decrement: 2 },
        quantityReserved: { increment: 2 },
      },
    });
  });

  it("returns 409 when quantityAvailable < requested quantity", async () => {
    mockTx.inventory.findUnique.mockResolvedValue({
      quantityAvailable: 1,
      quantityReserved: 0,
    });

    const res = await request(app)
      .post("/inventory/reserve")
      .send({
        orderId: "order-abc",
        items: [{ skuId: "sku-os-s", warehouseId: "wh-hsr", quantity: 5 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Insufficient stock/);
    expect(mockTx.inventory.update).not.toHaveBeenCalled();
  });

  it("returns 409 when inventory row does not exist", async () => {
    mockTx.inventory.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/inventory/reserve")
      .send({
        orderId: "order-abc",
        items: [{ skuId: "sku-missing", warehouseId: "wh-hsr", quantity: 1 }],
      });

    expect(res.status).toBe(409);
  });

  it("returns 400 when items array is empty", async () => {
    const res = await request(app)
      .post("/inventory/reserve")
      .send({ orderId: "order-abc", items: [] });

    expect(res.status).toBe(400);
  });
});

describe("POST /inventory/release", () => {
  it("returns 200 and increments availability", async () => {
    mockTx.inventory.update.mockResolvedValue({});

    const res = await request(app)
      .post("/inventory/release")
      .send({
        items: [{ skuId: "sku-os-s", warehouseId: "wh-hsr", quantity: 2 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockTx.inventory.update).toHaveBeenCalledWith({
      where: { skuId_warehouseId: { skuId: "sku-os-s", warehouseId: "wh-hsr" } },
      data: {
        quantityAvailable: { increment: 2 },
        quantityReserved: { decrement: 2 },
      },
    });
  });

  it("returns 400 when items missing from body", async () => {
    const res = await request(app).post("/inventory/release").send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd services/warehouse-service && npx jest --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../src/index'` or routes missing.

- [ ] **Step 3: Create services/warehouse-service/src/routes/inventory.ts**

```typescript
import { Router } from "express";
import { getPrisma } from "../lib/db";

const router = Router();

router.post("/reserve", async (req, res) => {
  const { orderId, items } = req.body as {
    orderId: string;
    items: { skuId: string; warehouseId: string; quantity: number }[];
  };

  if (!orderId || !items?.length) {
    return res.status(400).json({ error: "orderId and items required" });
  }

  const prisma = getPrisma();

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const inv = await tx.inventory.findUnique({
          where: {
            skuId_warehouseId: { skuId: item.skuId, warehouseId: item.warehouseId },
          },
        });

        if (!inv || inv.quantityAvailable < item.quantity) {
          throw new Error(`Insufficient stock for SKU ${item.skuId}`);
        }

        await tx.inventory.update({
          where: {
            skuId_warehouseId: { skuId: item.skuId, warehouseId: item.warehouseId },
          },
          data: {
            quantityAvailable: { decrement: item.quantity },
            quantityReserved: { increment: item.quantity },
          },
        });
      }
    });

    return res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reservation failed";
    if (message.includes("Insufficient stock")) {
      return res.status(409).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
});

router.post("/release", async (req, res) => {
  const { items } = req.body as {
    items: { skuId: string; warehouseId: string; quantity: number }[];
  };

  if (!items?.length) {
    return res.status(400).json({ error: "items required" });
  }

  const prisma = getPrisma();

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.inventory.update({
          where: {
            skuId_warehouseId: { skuId: item.skuId, warehouseId: item.warehouseId },
          },
          data: {
            quantityAvailable: { increment: item.quantity },
            quantityReserved: { decrement: item.quantity },
          },
        });
      }
    });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Release failed" });
  }
});

export default router;
```

- [ ] **Step 4: Update warehouse-service/src/index.ts**

Replace the full file:

```typescript
import express from "express";
import dotenv from "dotenv";
import inventoryRouter from "./routes/inventory";

dotenv.config();

const app = express();
const PORT = process.env.WAREHOUSE_SERVICE_PORT ?? 3002;
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "warehouse-service" })
);

app.use("/inventory", inventoryRouter);

if (require.main === module) {
  app.listen(PORT, () => console.log(`Warehouse Service on port ${PORT}`));
}

export default app;
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd services/warehouse-service && npx jest --no-coverage
```

Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add services/warehouse-service/src/ services/warehouse-service/tests/
git commit -m "feat(warehouse): add inventory reserve/release endpoints with tests"
```

---

## Task 5: Order state transition engine

**Files:**
- Create: `services/order-service/src/transitions.ts`
- Create: `services/order-service/tests/transitions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `services/order-service/tests/transitions.test.ts`:

```typescript
jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("../src/lib/rabbitmq", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import {
  isValidTransition,
  transitionOrder,
} from "../src/transitions";
import { getPrisma } from "../src/lib/db";
import { publishEvent } from "../src/lib/rabbitmq";
import { OrderStatus } from "@prisma/client";

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;
const mockPublish = publishEvent as jest.MockedFunction<typeof publishEvent>;

function makeMockPrisma(currentStatus: OrderStatus) {
  return {
    order: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: "order-1",
        status: currentStatus,
      }),
      update: jest.fn().mockResolvedValue({
        id: "order-1",
        status: currentStatus,
      }),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("isValidTransition", () => {
  it("allows PENDING → WAREHOUSE_PROCESSING", () => {
    expect(isValidTransition("PENDING", "WAREHOUSE_PROCESSING")).toBe(true);
  });

  it("allows PENDING → CANCELLED", () => {
    expect(isValidTransition("PENDING", "CANCELLED")).toBe(true);
  });

  it("allows ARRIVED → TRIAL_IN_PROGRESS", () => {
    expect(isValidTransition("ARRIVED", "TRIAL_IN_PROGRESS")).toBe(true);
  });

  it("allows ARRIVED → RESCHEDULED", () => {
    expect(isValidTransition("ARRIVED", "RESCHEDULED")).toBe(true);
  });

  it("allows RESCHEDULED → AGENT_ASSIGNED", () => {
    expect(isValidTransition("RESCHEDULED", "AGENT_ASSIGNED")).toBe(true);
  });

  it("rejects COMPLETED → PENDING", () => {
    expect(isValidTransition("COMPLETED", "PENDING")).toBe(false);
  });

  it("rejects WAREHOUSE_PROCESSING → CANCELLED", () => {
    expect(isValidTransition("WAREHOUSE_PROCESSING", "CANCELLED")).toBe(false);
  });

  it("rejects TRIAL_IN_PROGRESS → PENDING", () => {
    expect(isValidTransition("TRIAL_IN_PROGRESS", "PENDING")).toBe(false);
  });
});

describe("transitionOrder", () => {
  it("updates status and publishes order.status_changed on valid transition", async () => {
    const mock = makeMockPrisma("PENDING");
    mockGetPrisma.mockReturnValue(mock as any);

    await transitionOrder("order-1", "WAREHOUSE_PROCESSING", "staff-1");

    expect(mock.order.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "WAREHOUSE_PROCESSING" },
    });
    expect(mockPublish).toHaveBeenCalledWith(
      "order.status_changed",
      expect.objectContaining({
        orderId: "order-1",
        from: "PENDING",
        to: "WAREHOUSE_PROCESSING",
        actor: "staff-1",
      })
    );
  });

  it("throws and does NOT publish on invalid transition", async () => {
    const mock = makeMockPrisma("COMPLETED");
    mockGetPrisma.mockReturnValue(mock as any);

    await expect(
      transitionOrder("order-1", "PENDING", "actor")
    ).rejects.toThrow("Cannot transition from COMPLETED to PENDING");

    expect(mockPublish).not.toHaveBeenCalled();
    expect(mock.order.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd services/order-service && npx jest tests/transitions.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../src/transitions'`.

- [ ] **Step 3: Create services/order-service/src/transitions.ts**

```typescript
import { OrderStatus } from "@prisma/client";
import { getPrisma } from "./lib/db";
import { publishEvent } from "./lib/rabbitmq";

export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING:              ["WAREHOUSE_PROCESSING", "CANCELLED"],
  WAREHOUSE_PROCESSING: ["READY_FOR_PICKUP"],
  READY_FOR_PICKUP:     ["AGENT_ASSIGNED"],
  AGENT_ASSIGNED:       ["AGENT_EN_ROUTE", "CANCELLED"],
  AGENT_EN_ROUTE:       ["ARRIVED"],
  ARRIVED:              ["TRIAL_IN_PROGRESS", "COMPLETED", "RESCHEDULED"],
  TRIAL_IN_PROGRESS:    ["COMPLETED"],
  COMPLETED:            [],
  CANCELLED:            [],
  RESCHEDULED:          ["AGENT_ASSIGNED"],
};

export function isValidTransition(
  from: OrderStatus,
  to: OrderStatus
): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

export async function transitionOrder(
  orderId: string,
  newStatus: OrderStatus,
  actor: string
) {
  const prisma = getPrisma();
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  if (!isValidTransition(order.status, newStatus)) {
    throw new Error(`Cannot transition from ${order.status} to ${newStatus}`);
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: newStatus },
  });

  await publishEvent("order.status_changed", {
    orderId,
    from: order.status,
    to: newStatus,
    actor,
    timestamp: new Date().toISOString(),
  });

  return updated;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd services/order-service && npx jest tests/transitions.test.ts --no-coverage
```

Expected: 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/order-service/src/transitions.ts services/order-service/tests/transitions.test.ts
git commit -m "feat(order): add state transition engine with valid transition map"
```

---

## Task 6: Order creation endpoint (POST /)

**Files:**
- Create: `services/order-service/src/routes/orders.ts` (POST / only)
- Create: `services/order-service/tests/orders.test.ts`

> order-service calls routing-service at `ROUTING_SERVICE_URL` (default `http://localhost:8000`) and warehouse-service at `WAREHOUSE_SERVICE_URL` (default `http://localhost:3002`) via axios. Both are mocked in tests.

- [ ] **Step 1: Write failing tests**

Create `services/order-service/tests/orders.test.ts`:

```typescript
jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("../src/lib/redis", () => ({ getRedis: jest.fn() }));
jest.mock("../src/lib/rabbitmq", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("axios");
jest.mock("@threaddash/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: "user-1", role: "CUSTOMER", phone: "+919876500001" };
    next();
  },
}));
jest.mock("../src/transitions", () => ({
  transitionOrder: jest.fn().mockResolvedValue({}),
  isValidTransition: jest.fn().mockReturnValue(true),
}));

import request from "supertest";
import axios from "axios";
import { getPrisma } from "../src/lib/db";
import { getRedis } from "../src/lib/redis";
import { publishEvent } from "../src/lib/rabbitmq";

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;
const mockGetRedis = getRedis as jest.MockedFunction<typeof getRedis>;

let app: any;
beforeAll(async () => {
  app = (await import("../src/index")).default;
});

const mockRedis = {
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(1),
};

const SEED_SKUS = [
  {
    id: "sku-os-s",
    productId: "prod-os",
    product: { id: "prod-os", price: 129900 },
  },
];
const SEED_ADDRESS = {
  id: "addr-1",
  userId: "user-1",
  lat: 12.9352,
  lng: 77.6245,
  formattedAddress: "Koramangala, Bengaluru",
};
const SEED_WAREHOUSE = {
  id: "wh-hsr",
  lat: 12.9116,
  lng: 77.6389,
  activeOrderCount: 2,
  status: "ACTIVE",
};
const CREATED_ORDER = {
  id: "order-new",
  userId: "user-1",
  addressId: "addr-1",
  warehouseId: "wh-hsr",
  status: "PENDING",
  paymentMethod: "UPI",
  isTryOrder: false,
  totalAmount: 129900,
  deliveryFee: 0,
  items: [
    { id: "item-1", skuId: "sku-os-s", quantity: 1, price: 129900, status: "PENDING" },
  ],
};

function setupHappyPath() {
  const mockPrisma = {
    sku: { findMany: jest.fn().mockResolvedValue(SEED_SKUS) },
    address: { findFirst: jest.fn().mockResolvedValue(SEED_ADDRESS) },
    warehouse: {
      findMany: jest.fn().mockResolvedValue([SEED_WAREHOUSE]),
      update: jest.fn().mockResolvedValue({}),
    },
    order: { create: jest.fn().mockResolvedValue(CREATED_ORDER) },
  };
  mockGetPrisma.mockReturnValue(mockPrisma as any);
  mockGetRedis.mockReturnValue(mockRedis as any);

  mockAxios.post
    .mockResolvedValueOnce({ data: { warehouse_id: "wh-hsr", eta_minutes: 22 } })
    .mockResolvedValueOnce({ data: { success: true } });

  return mockPrisma;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /", () => {
  it("returns 201 with order and estimatedMinutes", async () => {
    const mockPrisma = setupHappyPath();

    const res = await request(app).post("/").send({
      items: [{ skuId: "sku-os-s", quantity: 1 }],
      addressId: "addr-1",
      paymentMethod: "UPI",
      isTryOrder: false,
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("order-new");
    expect(res.body.estimatedMinutes).toBe(22);
    expect(mockPrisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          warehouseId: "wh-hsr",
          paymentMethod: "UPI",
        }),
      })
    );
  });

  it("publishes order.placed event", async () => {
    setupHappyPath();
    const mockPub = publishEvent as jest.MockedFunction<typeof publishEvent>;

    await request(app).post("/").send({
      items: [{ skuId: "sku-os-s", quantity: 1 }],
      addressId: "addr-1",
      paymentMethod: "UPI",
    });

    expect(mockPub).toHaveBeenCalledWith(
      "order.placed",
      expect.objectContaining({ orderId: "order-new", warehouseId: "wh-hsr" })
    );
  });

  it("sets sla:order Redis key with 7200s TTL", async () => {
    setupHappyPath();

    await request(app).post("/").send({
      items: [{ skuId: "sku-os-s", quantity: 1 }],
      addressId: "addr-1",
      paymentMethod: "UPI",
    });

    expect(mockRedis.set).toHaveBeenCalledWith(
      "sla:order:order-new",
      expect.any(String),
      "EX",
      7200
    );
  });

  it("adds COD delivery fee of 2000 paise", async () => {
    const mockPrisma = setupHappyPath();

    await request(app).post("/").send({
      items: [{ skuId: "sku-os-s", quantity: 1 }],
      addressId: "addr-1",
      paymentMethod: "COD",
    });

    expect(mockPrisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryFee: 2000 }),
      })
    );
  });

  it("returns 400 when items is empty", async () => {
    const res = await request(app)
      .post("/")
      .send({ items: [], addressId: "addr-1", paymentMethod: "UPI" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when SKU not found in DB", async () => {
    const mockPrisma = {
      sku: { findMany: jest.fn().mockResolvedValue([]) },
      address: { findFirst: jest.fn().mockResolvedValue(SEED_ADDRESS) },
      warehouse: { findMany: jest.fn().mockResolvedValue([SEED_WAREHOUSE]) },
      order: { create: jest.fn() },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(mockRedis as any);

    const res = await request(app).post("/").send({
      items: [{ skuId: "sku-nonexistent", quantity: 1 }],
      addressId: "addr-1",
      paymentMethod: "UPI",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/SKU/);
  });

  it("returns 409 when warehouse-service reports insufficient stock", async () => {
    const mockPrisma = {
      sku: { findMany: jest.fn().mockResolvedValue(SEED_SKUS) },
      address: { findFirst: jest.fn().mockResolvedValue(SEED_ADDRESS) },
      warehouse: {
        findMany: jest.fn().mockResolvedValue([SEED_WAREHOUSE]),
        update: jest.fn(),
      },
      order: { create: jest.fn() },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(mockRedis as any);

    mockAxios.post
      .mockResolvedValueOnce({ data: { warehouse_id: "wh-hsr", eta_minutes: 22 } })
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { error: "Insufficient stock for SKU sku-os-s" },
        },
      });

    const res = await request(app).post("/").send({
      items: [{ skuId: "sku-os-s", quantity: 1 }],
      addressId: "addr-1",
      paymentMethod: "UPI",
    });

    expect(res.status).toBe(409);
    expect(mockPrisma.order.create).not.toHaveBeenCalled();
  });

  it("returns 503 when routing-service is unavailable", async () => {
    const mockPrisma = {
      sku: { findMany: jest.fn().mockResolvedValue(SEED_SKUS) },
      address: { findFirst: jest.fn().mockResolvedValue(SEED_ADDRESS) },
      warehouse: { findMany: jest.fn().mockResolvedValue([SEED_WAREHOUSE]) },
      order: { create: jest.fn() },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(mockRedis as any);
    mockAxios.post.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await request(app).post("/").send({
      items: [{ skuId: "sku-os-s", quantity: 1 }],
      addressId: "addr-1",
      paymentMethod: "UPI",
    });

    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd services/order-service && npx jest tests/orders.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `src/routes/orders.ts` does not exist.

- [ ] **Step 3: Create services/order-service/src/routes/orders.ts (POST / only)**

```typescript
import { Router } from "express";
import axios from "axios";
import { requireAuth } from "@threaddash/auth";
import { getPrisma } from "../lib/db";
import { getRedis } from "../lib/redis";
import { publishEvent } from "../lib/rabbitmq";
import { PaymentMethod } from "@prisma/client";

const router = Router();

const ROUTING_URL = process.env.ROUTING_SERVICE_URL ?? "http://localhost:8000";
const WAREHOUSE_URL = process.env.WAREHOUSE_SERVICE_URL ?? "http://localhost:3002";

router.post("/", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const {
    items,
    addressId,
    paymentMethod,
    isTryOrder = false,
  } = req.body as {
    items: { skuId: string; quantity: number }[];
    addressId: string;
    paymentMethod: PaymentMethod;
    isTryOrder?: boolean;
  };

  if (!items?.length || !addressId || !paymentMethod) {
    return res
      .status(400)
      .json({ error: "items, addressId, and paymentMethod required" });
  }

  const prisma = getPrisma();

  // 1. Validate SKUs exist
  const skuIds = items.map((i) => i.skuId);
  const skus = await prisma.sku.findMany({
    where: { id: { in: skuIds } },
    include: { product: true },
  });
  if (skus.length !== skuIds.length) {
    return res.status(400).json({ error: "One or more SKUs not found" });
  }

  // 2. Fetch delivery address (must belong to this user)
  const address = await prisma.address.findFirst({
    where: { id: addressId, userId },
  });
  if (!address) {
    return res.status(400).json({ error: "Address not found" });
  }

  // 3. Fetch active warehouses
  const warehouses = await prisma.warehouse.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, lat: true, lng: true, activeOrderCount: true },
  });
  if (!warehouses.length) {
    return res.status(503).json({ error: "No warehouses available" });
  }

  // 4. Select warehouse via routing-service (Haversine in Phase 1)
  let routingResult: { warehouse_id: string; eta_minutes: number };
  try {
    const { data } = await axios.post(`${ROUTING_URL}/select-warehouse`, {
      delivery_coords: { lat: address.lat, lng: address.lng },
      warehouses: warehouses.map((w) => ({
        warehouse_id: w.id,
        lat: w.lat,
        lng: w.lng,
        active_order_count: w.activeOrderCount,
        has_stock: true, // Phase 2 will pass real stock status here
      })),
    });
    if (!data.warehouse_id) {
      return res
        .status(503)
        .json({ error: "No warehouse available for delivery area" });
    }
    routingResult = data;
  } catch {
    return res.status(503).json({ error: "Routing service unavailable" });
  }

  // 5. Reserve inventory at warehouse-service
  const reserveItems = items.map((i) => ({
    skuId: i.skuId,
    warehouseId: routingResult.warehouse_id,
    quantity: i.quantity,
  }));

  try {
    await axios.post(`${WAREHOUSE_URL}/inventory/reserve`, {
      orderId: "pending",
      items: reserveItems,
    });
  } catch (err: any) {
    const status = err.response?.status === 409 ? 409 : 503;
    const message =
      err.response?.data?.error ?? "Inventory reservation failed";
    return res.status(status).json({ error: message });
  }

  // 6. Create Order + OrderItems in DB
  const totalAmount = items.reduce((sum, item) => {
    const sku = skus.find((s) => s.id === item.skuId)!;
    return sum + sku.product.price * item.quantity;
  }, 0);
  const deliveryFee = paymentMethod === "COD" ? 2000 : 0;

  let order;
  try {
    order = await prisma.order.create({
      data: {
        userId,
        addressId,
        warehouseId: routingResult.warehouse_id,
        paymentMethod,
        isTryOrder,
        totalAmount,
        deliveryFee,
        items: {
          create: items.map((item) => ({
            skuId: item.skuId,
            quantity: item.quantity,
            price: skus.find((s) => s.id === item.skuId)!.product.price,
          })),
        },
      },
      include: { items: true },
    });
  } catch (err) {
    // Rollback: release reserved inventory
    await axios
      .post(`${WAREHOUSE_URL}/inventory/release`, { items: reserveItems })
      .catch(() => {});
    return res.status(500).json({ error: "Order creation failed" });
  }

  // 7. Increment warehouse active count
  await prisma.warehouse.update({
    where: { id: routingResult.warehouse_id },
    data: { activeOrderCount: { increment: 1 } },
  });

  // 8. Publish ORDER_PLACED
  await publishEvent("order.placed", {
    orderId: order.id,
    warehouseId: routingResult.warehouse_id,
    userId,
    isTryOrder,
    timestamp: new Date().toISOString(),
  });

  // 9. Set SLA key in Redis (2-hour window for cron cleanup)
  const redis = getRedis();
  await redis.set(`sla:order:${order.id}`, new Date().toISOString(), "EX", 7200);

  return res.status(201).json({ ...order, estimatedMinutes: routingResult.eta_minutes });
});

export default router;
```

- [ ] **Step 4: Update services/order-service/src/index.ts**

Replace the full file (temporary — will be replaced again in Task 9 with all routes):

```typescript
import express from "express";
import dotenv from "dotenv";
import ordersRouter from "./routes/orders";

dotenv.config();

const app = express();
const PORT = process.env.ORDER_SERVICE_PORT ?? 3001;
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "order-service" })
);

app.use("/", ordersRouter);

if (require.main === module) {
  app.listen(PORT, () => console.log(`Order Service on port ${PORT}`));
}

export default app;
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd services/order-service && npx jest tests/orders.test.ts --no-coverage
```

Expected: 8 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add services/order-service/src/ services/order-service/tests/orders.test.ts
git commit -m "feat(order): add order creation endpoint with routing+inventory integration"
```

---

## Task 7: Order read, status update, cancel, mark-absent

**Files:**
- Modify: `services/order-service/src/routes/orders.ts` (append 4 new routes)
- Modify: `services/order-service/tests/orders.test.ts` (append tests)

- [ ] **Step 1: Append tests for the 4 new routes to orders.test.ts**

Add the following after the closing `});` of `describe("POST /")` in `services/order-service/tests/orders.test.ts`:

```typescript
const EXISTING_ORDER = {
  id: "order-existing",
  userId: "user-1",
  warehouseId: "wh-hsr",
  status: "PENDING" as const,
  paymentMethod: "UPI",
  items: [
    { id: "item-1", skuId: "sku-os-s", quantity: 1, price: 129900, status: "PENDING" },
  ],
  address: { id: "addr-1", formattedAddress: "Koramangala" },
};

describe("GET /:id", () => {
  it("returns 200 with order for the authenticated user", async () => {
    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue(EXISTING_ORDER) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    const res = await request(app).get("/order-existing");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("order-existing");
  });

  it("returns 404 when order not found", async () => {
    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    const res = await request(app).get("/order-not-found");
    expect(res.status).toBe(404);
  });

  it("returns 403 when order belongs to a different user", async () => {
    const mockPrisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({ ...EXISTING_ORDER, userId: "user-other" }),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    const res = await request(app).get("/order-existing");
    expect(res.status).toBe(403);
  });
});

describe("PATCH /:id/status", () => {
  it("returns 200 and calls transitionOrder", async () => {
    const { transitionOrder } = await import("../src/transitions");
    const mockTransition = transitionOrder as jest.MockedFunction<typeof transitionOrder>;
    mockTransition.mockResolvedValue({
      id: "order-existing",
      status: "WAREHOUSE_PROCESSING",
    } as any);

    const res = await request(app)
      .patch("/order-existing/status")
      .send({ status: "WAREHOUSE_PROCESSING" });

    expect(res.status).toBe(200);
    expect(mockTransition).toHaveBeenCalledWith(
      "order-existing",
      "WAREHOUSE_PROCESSING",
      "user-1"
    );
  });

  it("returns 409 when transition is invalid", async () => {
    const { transitionOrder } = await import("../src/transitions");
    (transitionOrder as jest.Mock).mockRejectedValue(
      new Error("Cannot transition from COMPLETED to PENDING")
    );

    const res = await request(app)
      .patch("/order-existing/status")
      .send({ status: "PENDING" });

    expect(res.status).toBe(409);
  });
});

describe("POST /:id/cancel", () => {
  it("transitions to CANCELLED and releases inventory", async () => {
    const { transitionOrder } = await import("../src/transitions");
    (transitionOrder as jest.Mock).mockResolvedValue({
      id: "order-existing",
      status: "CANCELLED",
    });

    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue(EXISTING_ORDER) },
      warehouse: { update: jest.fn().mockResolvedValue({}) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(mockRedis as any);
    mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

    const res = await request(app).post("/order-existing/cancel");

    expect(res.status).toBe(200);
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/inventory/release"),
      expect.objectContaining({ items: expect.any(Array) })
    );
  });

  it("returns 404 when order not found", async () => {
    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    const res = await request(app).post("/order-not-found/cancel");
    expect(res.status).toBe(404);
  });
});

describe("POST /:id/mark-absent", () => {
  it("increments absentAttempts and returns updated count", async () => {
    const mockPrisma = {
      deliveryAssignment: {
        findUnique: jest.fn().mockResolvedValue({
          orderId: "order-existing",
          absentAttempts: 1,
        }),
        update: jest.fn().mockResolvedValue({ absentAttempts: 2 }),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    const res = await request(app).post("/order-existing/mark-absent");
    expect(res.status).toBe(200);
    expect(res.body.absentAttempts).toBe(2);
  });

  it("publishes order.absent_threshold_reached on 3rd absence", async () => {
    const mockPrisma = {
      deliveryAssignment: {
        findUnique: jest.fn().mockResolvedValue({
          orderId: "order-existing",
          absentAttempts: 2,
        }),
        update: jest.fn().mockResolvedValue({ absentAttempts: 3 }),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    await request(app).post("/order-existing/mark-absent");

    const mockPub = publishEvent as jest.MockedFunction<typeof publishEvent>;
    expect(mockPub).toHaveBeenCalledWith(
      "order.absent_threshold_reached",
      expect.objectContaining({ orderId: "order-existing", attempts: 3 })
    );
  });

  it("returns 404 when no assignment found", async () => {
    const mockPrisma = {
      deliveryAssignment: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    const res = await request(app).post("/order-not-found/mark-absent");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL on new describe blocks**

```bash
cd services/order-service && npx jest tests/orders.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — new routes return 404.

- [ ] **Step 3: Append 4 routes to orders.ts, before `export default router`**

```typescript
router.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const prisma = getPrisma();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { sku: { include: { product: true } } } },
      address: true,
    },
  });

  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.userId !== req.user!.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return res.json(order);
});

router.patch("/:id/status", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status: string };

  if (!status) return res.status(400).json({ error: "status required" });

  try {
    const { transitionOrder } = await import("../transitions");
    const updated = await transitionOrder(id, status as any, req.user!.userId);
    return res.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status update failed";
    const code =
      message.includes("Cannot transition") || message.includes("not found")
        ? 409
        : 500;
    return res.status(code).json({ error: message });
  }
});

router.post("/:id/cancel", requireAuth, async (req, res) => {
  const { id } = req.params;
  const prisma = getPrisma();

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.userId !== req.user!.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const { transitionOrder } = await import("../transitions");
    await transitionOrder(id, "CANCELLED", req.user!.userId);

    await axios.post(`${WAREHOUSE_URL}/inventory/release`, {
      items: order.items.map((item) => ({
        skuId: item.skuId,
        warehouseId: order.warehouseId,
        quantity: item.quantity,
      })),
    });

    await prisma.warehouse.update({
      where: { id: order.warehouseId },
      data: { activeOrderCount: { decrement: 1 } },
    });

    const redis = getRedis();
    await redis.del(`sla:order:${id}`);

    return res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cancel failed";
    const code = message.includes("Cannot transition") ? 409 : 500;
    return res.status(code).json({ error: message });
  }
});

router.post("/:id/mark-absent", requireAuth, async (req, res) => {
  const { id } = req.params;
  const prisma = getPrisma();

  const assignment = await prisma.deliveryAssignment.findUnique({
    where: { orderId: id },
  });

  if (!assignment) return res.status(404).json({ error: "Assignment not found" });

  const newAttempts = assignment.absentAttempts + 1;

  await prisma.deliveryAssignment.update({
    where: { orderId: id },
    data: { absentAttempts: newAttempts },
  });

  if (newAttempts >= 3) {
    await publishEvent("order.absent_threshold_reached", {
      orderId: id,
      attempts: newAttempts,
      timestamp: new Date().toISOString(),
    });
    // Phase 5: charge INR 99 absence fee via payment-service
  }

  return res.json({ absentAttempts: newAttempts });
});
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd services/order-service && npx jest tests/orders.test.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/order-service/src/routes/orders.ts services/order-service/tests/orders.test.ts
git commit -m "feat(order): add GET/PATCH status/cancel/mark-absent routes"
```

---

## Task 8: Trial start and complete endpoints

**Files:**
- Create: `services/order-service/src/routes/trial.ts`
- Create: `services/order-service/tests/trial.test.ts`

- [ ] **Step 1: Write failing tests**

Create `services/order-service/tests/trial.test.ts`:

```typescript
jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("../src/lib/redis", () => ({ getRedis: jest.fn() }));
jest.mock("../src/lib/rabbitmq", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("axios");
jest.mock("@threaddash/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: "user-1", role: "CUSTOMER", phone: "+919876500001" };
    next();
  },
}));
jest.mock("../src/transitions", () => ({
  transitionOrder: jest.fn().mockResolvedValue({}),
}));

import request from "supertest";
import axios from "axios";
import { getPrisma } from "../src/lib/db";
import { getRedis } from "../src/lib/redis";
import { publishEvent } from "../src/lib/rabbitmq";

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;
const mockGetRedis = getRedis as jest.MockedFunction<typeof getRedis>;

let app: any;
beforeAll(async () => {
  app = (await import("../src/index")).default;
});

const mockRedis = {
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(1),
};

const TRY_ORDER = {
  id: "order-try",
  userId: "user-1",
  warehouseId: "wh-hsr",
  status: "ARRIVED",
  isTryOrder: true,
  items: [
    { id: "item-1", skuId: "sku-os-s", quantity: 1, price: 129900 },
    { id: "item-2", skuId: "sku-jeans-32", quantity: 1, price: 89900 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRedis.mockReturnValue(mockRedis as any);
});

describe("POST /:id/trial/start", () => {
  it("transitions to TRIAL_IN_PROGRESS and sets 30-min Redis timer", async () => {
    const { transitionOrder } = await import("../src/transitions");
    (transitionOrder as jest.Mock).mockResolvedValue({
      id: "order-try",
      status: "TRIAL_IN_PROGRESS",
    });

    const mockPrisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(TRY_ORDER),
        update: jest.fn().mockResolvedValue(TRY_ORDER),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    const res = await request(app).post("/order-try/trial/start");

    expect(res.status).toBe(200);
    expect(res.body.trialStartedAt).toBeDefined();
    expect(res.body.trialEndsAt).toBeDefined();
    expect(mockRedis.set).toHaveBeenCalledWith(
      "trial:order:order-try",
      expect.any(String),
      "EX",
      1800
    );
    expect(transitionOrder).toHaveBeenCalledWith(
      "order-try",
      "TRIAL_IN_PROGRESS",
      "user-1"
    );
  });

  it("returns 400 for non-try orders", async () => {
    const mockPrisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({ ...TRY_ORDER, isTryOrder: false }),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    const res = await request(app).post("/order-try/trial/start");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Not a try order/);
  });

  it("returns 404 when order not found", async () => {
    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    const res = await request(app).post("/order-not-found/trial/start");
    expect(res.status).toBe(404);
  });
});

describe("POST /:id/trial/complete", () => {
  it("marks items, releases returns, transitions to COMPLETED", async () => {
    const { transitionOrder } = await import("../src/transitions");
    (transitionOrder as jest.Mock).mockResolvedValue({
      id: "order-try",
      status: "COMPLETED",
    });

    const mockPrisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          ...TRY_ORDER,
          status: "TRIAL_IN_PROGRESS",
        }),
      },
      orderItem: { update: jest.fn().mockResolvedValue({}) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

    const res = await request(app)
      .post("/order-try/trial/complete")
      .send({
        keptSkuIds: ["sku-os-s"],
        returnedSkuIds: ["sku-jeans-32"],
      });

    expect(res.status).toBe(200);
    expect(res.body.keptCount).toBe(1);
    expect(res.body.returnedCount).toBe(1);
    expect(mockPrisma.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "KEPT" } })
    );
    expect(mockPrisma.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "RETURNED" } })
    );
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/inventory/release"),
      expect.objectContaining({
        items: [{ skuId: "sku-jeans-32", warehouseId: "wh-hsr", quantity: 1 }],
      })
    );
    expect(transitionOrder).toHaveBeenCalledWith(
      "order-try",
      "COMPLETED",
      "user-1"
    );
  });

  it("publishes order.completed event", async () => {
    const { transitionOrder } = await import("../src/transitions");
    (transitionOrder as jest.Mock).mockResolvedValue({});

    const mockPrisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          ...TRY_ORDER,
          status: "TRIAL_IN_PROGRESS",
        }),
      },
      orderItem: { update: jest.fn().mockResolvedValue({}) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockAxios.post.mockResolvedValue({ data: { success: true } });

    await request(app)
      .post("/order-try/trial/complete")
      .send({ keptSkuIds: ["sku-os-s"], returnedSkuIds: [] });

    const mockPub = publishEvent as jest.MockedFunction<typeof publishEvent>;
    expect(mockPub).toHaveBeenCalledWith(
      "order.completed",
      expect.objectContaining({ orderId: "order-try" })
    );
  });

  it("skips inventory release when no items returned", async () => {
    const { transitionOrder } = await import("../src/transitions");
    (transitionOrder as jest.Mock).mockResolvedValue({});

    const mockPrisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          ...TRY_ORDER,
          status: "TRIAL_IN_PROGRESS",
        }),
      },
      orderItem: { update: jest.fn().mockResolvedValue({}) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    await request(app)
      .post("/order-try/trial/complete")
      .send({ keptSkuIds: ["sku-os-s", "sku-jeans-32"], returnedSkuIds: [] });

    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it("returns 404 when order not found", async () => {
    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    const res = await request(app)
      .post("/order-not-found/trial/complete")
      .send({ keptSkuIds: [], returnedSkuIds: [] });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd services/order-service && npx jest tests/trial.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `src/routes/trial.ts` not found.

- [ ] **Step 3: Create services/order-service/src/routes/trial.ts**

```typescript
import { Router } from "express";
import axios from "axios";
import { requireAuth } from "@threaddash/auth";
import { getPrisma } from "../lib/db";
import { getRedis } from "../lib/redis";
import { publishEvent } from "../lib/rabbitmq";
import { transitionOrder } from "../transitions";

const router = Router();
const WAREHOUSE_URL = process.env.WAREHOUSE_SERVICE_URL ?? "http://localhost:3002";

router.post("/:id/trial/start", requireAuth, async (req, res) => {
  const { id } = req.params;
  const prisma = getPrisma();

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!order.isTryOrder) {
    return res.status(400).json({ error: "Not a try order" });
  }

  try {
    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt.getTime() + 30 * 60 * 1000);

    await transitionOrder(id, "TRIAL_IN_PROGRESS", req.user!.userId);

    await prisma.order.update({
      where: { id },
      data: { trialStartedAt, trialEndsAt },
    });

    const redis = getRedis();
    await redis.set(`trial:order:${id}`, trialEndsAt.toISOString(), "EX", 1800);

    return res.json({ trialStartedAt, trialEndsAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trial start failed";
    const code = message.includes("Cannot transition") ? 409 : 500;
    return res.status(code).json({ error: message });
  }
});

router.post("/:id/trial/complete", requireAuth, async (req, res) => {
  const { keptSkuIds = [], returnedSkuIds = [] } = req.body as {
    keptSkuIds: string[];
    returnedSkuIds: string[];
  };

  const { id } = req.params;
  const prisma = getPrisma();

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });

  try {
    for (const item of order.items) {
      if (keptSkuIds.includes(item.skuId)) {
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { status: "KEPT" },
        });
      } else if (returnedSkuIds.includes(item.skuId)) {
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { status: "RETURNED" },
        });
      }
    }

    if (returnedSkuIds.length > 0) {
      const releaseItems = order.items
        .filter((i) => returnedSkuIds.includes(i.skuId))
        .map((i) => ({
          skuId: i.skuId,
          warehouseId: order.warehouseId,
          quantity: i.quantity,
        }));
      await axios.post(`${WAREHOUSE_URL}/inventory/release`, {
        items: releaseItems,
      });
    }

    await transitionOrder(id, "COMPLETED", req.user!.userId);

    await publishEvent("order.completed", {
      orderId: id,
      keptSkuIds,
      returnedSkuIds,
      timestamp: new Date().toISOString(),
    });

    const redis = getRedis();
    await redis.del(`sla:order:${id}`);
    await redis.del(`trial:order:${id}`);

    // Phase 5: Razorpay partial capture goes here

    return res.json({
      success: true,
      keptCount: keptSkuIds.length,
      returnedCount: returnedSkuIds.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trial complete failed";
    const code = message.includes("Cannot transition") ? 409 : 500;
    return res.status(code).json({ error: message });
  }
});

export default router;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd services/order-service && npx jest tests/trial.test.ts --no-coverage
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/order-service/src/routes/trial.ts services/order-service/tests/trial.test.ts
git commit -m "feat(order): add trial start/complete endpoints"
```

---

## Task 9: SLA monitor + wire order-service index.ts

**Files:**
- Create: `services/order-service/src/sla-monitor.ts`
- Create: `services/order-service/tests/sla-monitor.test.ts`
- Modify: `services/order-service/src/index.ts` (add trial router + SLA monitor)

- [ ] **Step 1: Write failing tests**

Create `services/order-service/tests/sla-monitor.test.ts`:

```typescript
jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("../src/lib/redis", () => ({ getRedis: jest.fn() }));
jest.mock("../src/lib/rabbitmq", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import { checkSlaOnce } from "../src/sla-monitor";
import { getPrisma } from "../src/lib/db";
import { getRedis } from "../src/lib/redis";
import { publishEvent } from "../src/lib/rabbitmq";

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;
const mockGetRedis = getRedis as jest.MockedFunction<typeof getRedis>;
const mockPublish = publishEvent as jest.MockedFunction<typeof publishEvent>;

function makeRedis(keys: Record<string, string | null> = {}) {
  return {
    get: jest.fn((key: string) => Promise.resolve(keys[key] ?? null)),
    set: jest.fn().mockResolvedValue("OK"),
  };
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60 * 1000);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("checkSlaOnce", () => {
  it("does nothing for orders under 36 minutes old", async () => {
    const mockPrisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          { id: "order-1", createdAt: minutesAgo(20) },
        ]),
        update: jest.fn(),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(makeRedis() as any);

    await checkSlaOnce();

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("publishes order.sla_warning for orders 36–44 minutes old", async () => {
    const mockPrisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          { id: "order-1", createdAt: minutesAgo(38) },
        ]),
        update: jest.fn(),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(makeRedis() as any);

    await checkSlaOnce();

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledWith(
      "order.sla_warning",
      expect.objectContaining({ orderId: "order-1" })
    );
  });

  it("publishes sla_breach AND updates slaBreach flag for orders >= 45 minutes old", async () => {
    const mockPrisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          { id: "order-1", createdAt: minutesAgo(47) },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(makeRedis() as any);

    await checkSlaOnce();

    expect(mockPublish).toHaveBeenCalledWith(
      "order.sla_warning",
      expect.objectContaining({ orderId: "order-1" })
    );
    expect(mockPublish).toHaveBeenCalledWith(
      "order.sla_breach",
      expect.objectContaining({ orderId: "order-1" })
    );
    expect(mockPrisma.order.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { slaBreach: true },
    });
  });

  it("does NOT re-publish warning when sla:warn key exists", async () => {
    const mockPrisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          { id: "order-1", createdAt: minutesAgo(38) },
        ]),
        update: jest.fn(),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(makeRedis({ "sla:warn:order-1": "1" }) as any);

    await checkSlaOnce();

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("does NOT re-publish breach when sla:breach key exists", async () => {
    const mockPrisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          { id: "order-1", createdAt: minutesAgo(50) },
        ]),
        update: jest.fn(),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(
      makeRedis({
        "sla:warn:order-1": "1",
        "sla:breach:order-1": "1",
      }) as any
    );

    await checkSlaOnce();

    expect(mockPublish).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd services/order-service && npx jest tests/sla-monitor.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../src/sla-monitor'`.

- [ ] **Step 3: Create services/order-service/src/sla-monitor.ts**

```typescript
import cron from "node-cron";
import { getPrisma } from "./lib/db";
import { getRedis } from "./lib/redis";
import { publishEvent } from "./lib/rabbitmq";

const SLA_TOTAL_MINUTES = 45;
const SLA_WARNING_MINUTES = 36; // 80% of 45

export async function checkSlaOnce(): Promise<void> {
  const prisma = getPrisma();
  const redis = getRedis();
  const now = Date.now();

  const activeOrders = await prisma.order.findMany({
    where: {
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      createdAt: { gte: new Date(now - 3 * 60 * 60 * 1000) },
    },
    select: { id: true, createdAt: true },
  });

  for (const order of activeOrders) {
    const elapsedMin = (now - order.createdAt.getTime()) / 60000;

    if (elapsedMin >= SLA_WARNING_MINUTES) {
      const warned = await redis.get(`sla:warn:${order.id}`);
      if (!warned) {
        await publishEvent("order.sla_warning", {
          orderId: order.id,
          elapsedMin: Math.floor(elapsedMin),
        });
        await redis.set(`sla:warn:${order.id}`, "1", "EX", 7200);
      }
    }

    if (elapsedMin >= SLA_TOTAL_MINUTES) {
      const breached = await redis.get(`sla:breach:${order.id}`);
      if (!breached) {
        await publishEvent("order.sla_breach", {
          orderId: order.id,
          elapsedMin: Math.floor(elapsedMin),
        });
        await redis.set(`sla:breach:${order.id}`, "1", "EX", 7200);
        await prisma.order.update({
          where: { id: order.id },
          data: { slaBreach: true },
        });
      }
    }
  }
}

export function startSlaMonitor(): cron.ScheduledTask {
  return cron.schedule("* * * * *", checkSlaOnce);
}
```

- [ ] **Step 4: Run SLA tests — expect PASS**

```bash
cd services/order-service && npx jest tests/sla-monitor.test.ts --no-coverage
```

Expected: 5 tests PASS.

- [ ] **Step 5: Update services/order-service/src/index.ts — final version**

Replace the full file:

```typescript
import express from "express";
import dotenv from "dotenv";
import ordersRouter from "./routes/orders";
import trialRouter from "./routes/trial";
import { startSlaMonitor } from "./sla-monitor";

dotenv.config();

const app = express();
const PORT = process.env.ORDER_SERVICE_PORT ?? 3001;
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "order-service" })
);

app.use("/", ordersRouter);
app.use("/", trialRouter);

if (require.main === module) {
  startSlaMonitor();
  app.listen(PORT, () => console.log(`Order Service on port ${PORT}`));
}

export default app;
```

- [ ] **Step 6: Run full order-service test suite**

```bash
cd services/order-service && npx jest --no-coverage
```

Expected: all 4 test files pass (transitions + orders + trial + sla-monitor).

- [ ] **Step 7: Run full warehouse-service test suite**

```bash
cd services/warehouse-service && npx jest --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 8: Run routing-service pytest**

```bash
cd services/routing-service && pytest test_routing.py -v
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add services/order-service/src/ services/order-service/tests/sla-monitor.test.ts
git commit -m "feat(order): add SLA monitor and wire all routes into index.ts"
```

---

## Exit Criteria Smoke Test

After all tasks pass, verify the full lifecycle manually:

**1. Start services**

```bash
# Terminal 1
docker compose up -d postgres redis rabbitmq

# Terminal 2
cd services/warehouse-service && npx ts-node-dev src/index.ts

# Terminal 3
cd services/routing-service && uvicorn main:app --reload --port 8000

# Terminal 4
cd services/order-service && npx ts-node-dev src/index.ts
```

**2. Get JWT from api-gateway (Phase 0 flow)**

```bash
# If previous JWT expired, re-issue via api-gateway:
TOKEN=$(curl -s -X POST http://localhost:3000/auth/send-otp \
  -H "Content-Type: application/json" -d '{"phone":"+919876500001"}' && \
  # Read OTP from api-gateway log, then:
  curl -s -X POST http://localhost:3000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876500001","otp":"<OTP>"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
```

**3. Seed an address for the test user**

```bash
# Use psql to insert a delivery address for the test user created in Phase 0
# Get the userId from: SELECT id FROM users WHERE phone = '+919876500001';
docker exec threaddash_postgres psql -U threaddash -d threaddash_dev -c "
INSERT INTO addresses (id, user_id, label, formatted_address, lat, lng)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '<userId>',
  'Home',
  'Koramangala 5th Block, Bengaluru',
  12.9352,
  77.6245
) ON CONFLICT DO NOTHING;
"
```

**4. Place a Try order**

```bash
ORDER=$(curl -s -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "items": [{"skuId": "sku-os-s", "quantity": 1}],
    "addressId": "00000000-0000-0000-0000-000000000001",
    "paymentMethod": "UPI",
    "isTryOrder": true
  }')
echo $ORDER
ORDER_ID=$(echo $ORDER | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
```

Expected: `201` with `estimatedMinutes > 0`.

**5. Drive through all states**

```bash
for STATUS in WAREHOUSE_PROCESSING READY_FOR_PICKUP AGENT_ASSIGNED AGENT_EN_ROUTE ARRIVED; do
  curl -s -X PATCH http://localhost:3001/$ORDER_ID/status \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d "{\"status\": \"$STATUS\"}"
  echo " → $STATUS"
done
```

**6. Start trial, then complete**

```bash
curl -s -X POST http://localhost:3001/$ORDER_ID/trial/start \
  -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:3001/$ORDER_ID/trial/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"keptSkuIds": ["sku-os-s"], "returnedSkuIds": []}'
```

Expected: `{"success": true, "keptCount": 1, "returnedCount": 0}`

**7. Verify in RabbitMQ Management UI**

Open `http://localhost:15672` (guest/guest). Under Queues or publish test: confirm messages with routing keys `order.placed`, `order.status_changed` (×6), `order.completed` appear in the `threaddash` exchange.

**8. Tag**

```bash
git tag phase-1-complete
```
