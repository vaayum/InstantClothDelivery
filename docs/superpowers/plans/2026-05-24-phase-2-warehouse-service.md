# Phase 2 — Warehouse Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add picking queue, RabbitMQ consumer, and returns processing to warehouse-service so warehouse staff can receive orders, scan items, and record trial returns.

**Architecture:** A RabbitMQ consumer subscribes to `order.placed` and creates `PickingTask` + `PickingItem` rows per order. Three Express routes serve the picking workflow (fetch queue, scan item, pack ready) and one route handles returns. `pack-ready` calls order-service HTTP to trigger `READY_FOR_PICKUP`. All tests use Jest mocks (no real RabbitMQ/Postgres in tests).

**Tech Stack:** Express, TypeScript, Prisma 5, amqplib, axios, Jest 29 + ts-jest + supertest

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/database/prisma/schema.prisma` | Modify | Add `PickingStatus`, `PickItemStatus` enums + `PickingTask`, `PickingItem` models + back-relations on `Warehouse`, `Sku`, `Order` |
| `services/warehouse-service/src/lib/rabbitmq.ts` | Create | amqplib channel singleton for publishing (mirrors order-service pattern) |
| `services/warehouse-service/src/lib/role.ts` | Create | `requireRole(role)` Express middleware factory |
| `services/warehouse-service/src/consumer.ts` | Create | `handleOrderPlaced(payload)` + `startConsumer()` exports |
| `services/warehouse-service/src/routes/picking.ts` | Create | `GET /:warehouseId`, `POST /:orderId/pick-item`, `POST /:orderId/pack-ready` |
| `services/warehouse-service/src/routes/returns.ts` | Create | `POST /receive` |
| `services/warehouse-service/src/index.ts` | Modify | Wire new routes + call `startConsumer()` at boot |
| `services/warehouse-service/tests/consumer.test.ts` | Create | Unit tests for `handleOrderPlaced` |
| `services/warehouse-service/tests/picking.test.ts` | Create | Route tests for all three picking endpoints |
| `services/warehouse-service/tests/returns.test.ts` | Create | Route tests for returns receive endpoint |

---

## Task 1: Prisma schema migration — add PickingTask and PickingItem

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Context:** The schema lives at `packages/database/prisma/schema.prisma`. No picking tables exist yet. The `Warehouse` model needs a back-relation `pickingTasks`. The `Sku` model needs a back-relation `pickingItems`. The `Order` model needs a back-relation `pickingTask`. Run migration and client regeneration from the repo root using workspace scripts.

- [ ] **Step 1: Add enums to schema**

Open `packages/database/prisma/schema.prisma`. After the `ReturnCondition` enum (around line 84), add:

```prisma
enum PickingStatus {
  PENDING
  IN_PROGRESS
  PACKED
}

enum PickItemStatus {
  PENDING
  FOUND
  NOT_AVAILABLE
}
```

- [ ] **Step 2: Add back-relations to existing models**

In the `Warehouse` model, after the `orders Order[]` line, add:
```prisma
  pickingTasks PickingTask[]
```

In the `Sku` model, after the `orderItems OrderItem[]` line, add:
```prisma
  pickingItems PickingItem[]
```

In the `Order` model, after the `returns Return[]` line, add:
```prisma
  pickingTask PickingTask?
```

- [ ] **Step 3: Add PickingTask and PickingItem models**

After the `Return` model (around line 332), add:

```prisma
// ─── Picking ──────────────────────────────────────────────────────────────────

model PickingTask {
  id          String        @id @default(uuid())
  orderId     String        @unique
  warehouseId String
  status      PickingStatus @default(PENDING)
  slaDeadline DateTime
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  order     Order         @relation(fields: [orderId], references: [id])
  warehouse Warehouse     @relation(fields: [warehouseId], references: [id])
  items     PickingItem[]

  @@map("picking_tasks")
}

model PickingItem {
  id            String         @id @default(uuid())
  pickingTaskId String
  skuId         String
  quantity      Int
  status        PickItemStatus @default(PENDING)
  scannedAt     DateTime?

  pickingTask PickingTask @relation(fields: [pickingTaskId], references: [id])
  sku         Sku         @relation(fields: [skuId], references: [id])

  @@map("picking_items")
}
```

- [ ] **Step 4: Run migration**

```bash
npm run db:migrate
```

When prompted for a migration name, enter: `add_picking_tasks`

Expected output:
```
✔ Enter a name for the new migration: add_picking_tasks
Applying migration `20260524xxxxxx_add_picking_tasks`
The following migration(s) have been applied:
  migrations/20260524xxxxxx_add_picking_tasks/migration.sql
```

- [ ] **Step 5: Regenerate Prisma client**

```bash
npm run db:generate
```

Expected: no errors, `@prisma/client` updated with `pickingTask`, `pickingItem`, `PickingStatus`, `PickItemStatus` types.

- [ ] **Step 6: Verify tables exist**

```bash
docker exec threaddash_postgres psql -U threaddash -d threaddash_dev -c "\dt picking*"
```

Expected:
```
 public | picking_items | table | threaddash
 public | picking_tasks | table | threaddash
```

- [ ] **Step 7: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add PickingTask and PickingItem schema (phase 2 migration)"
```

---

## Task 2: RabbitMQ singleton + consumer

**Files:**
- Create: `services/warehouse-service/src/lib/rabbitmq.ts`
- Create: `services/warehouse-service/src/lib/role.ts`
- Create: `services/warehouse-service/tests/consumer.test.ts`
- Create: `services/warehouse-service/src/consumer.ts`

**Context:** `src/lib/rabbitmq.ts` is a publishing channel singleton — exact copy of the pattern in `services/order-service/src/lib/rabbitmq.ts`. The consumer creates its own amqplib connection (separate from the publishing channel). `handleOrderPlaced` is exported separately so tests can unit-test it without starting a real RabbitMQ connection. Tests mock `getPrisma` the same way order-service tests do: `jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }))`.

- [ ] **Step 1: Create rabbitmq lib singleton**

Create `services/warehouse-service/src/lib/rabbitmq.ts`:

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

- [ ] **Step 2: Create role middleware**

Create `services/warehouse-service/src/lib/role.ts`:

```typescript
import type { Request, Response, NextFunction } from "express";

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
```

- [ ] **Step 3: Write failing consumer test**

Create `services/warehouse-service/tests/consumer.test.ts`:

```typescript
jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));

import { getPrisma } from "../src/lib/db";
import { handleOrderPlaced } from "../src/consumer";

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;

beforeEach(() => { jest.clearAllMocks(); });

describe("handleOrderPlaced", () => {
  it("creates PickingTask with slaDeadline ~45 min from now and one PickingItem per order item", async () => {
    const mockCreate = jest.fn().mockResolvedValue({ id: "task-1" });
    const mockFindMany = jest.fn().mockResolvedValue([
      { id: "item-1", skuId: "sku-os-s", quantity: 1 },
      { id: "item-2", skuId: "sku-os-m", quantity: 2 },
    ]);
    mockGetPrisma.mockReturnValue({
      orderItem: { findMany: mockFindMany },
      pickingTask: { create: mockCreate },
    } as any);

    const before = Date.now();
    await handleOrderPlaced({ orderId: "order-1", warehouseId: "wh-hsr-layout" });
    const after = Date.now();

    expect(mockFindMany).toHaveBeenCalledWith({ where: { orderId: "order-1" } });

    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data.orderId).toBe("order-1");
    expect(callArg.data.warehouseId).toBe("wh-hsr-layout");
    expect(callArg.data.status).toBe("PENDING");

    const sla = new Date(callArg.data.slaDeadline).getTime();
    expect(sla).toBeGreaterThanOrEqual(before + 45 * 60 * 1000 - 200);
    expect(sla).toBeLessThanOrEqual(after + 45 * 60 * 1000 + 200);

    expect(callArg.data.items.create).toEqual([
      { skuId: "sku-os-s", quantity: 1, status: "PENDING" },
      { skuId: "sku-os-m", quantity: 2, status: "PENDING" },
    ]);
  });

  it("creates an empty PickingTask when order has no items", async () => {
    const mockCreate = jest.fn().mockResolvedValue({ id: "task-2" });
    mockGetPrisma.mockReturnValue({
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      pickingTask: { create: mockCreate },
    } as any);

    await expect(
      handleOrderPlaced({ orderId: "order-empty", warehouseId: "wh-hsr-layout" })
    ).resolves.not.toThrow();

    expect(mockCreate.mock.calls[0][0].data.items.create).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd services/warehouse-service && npm test -- --testPathPattern=consumer
```

Expected: FAIL — `Cannot find module '../src/consumer'`

- [ ] **Step 5: Implement consumer**

Create `services/warehouse-service/src/consumer.ts`:

```typescript
import amqp from "amqplib";
import { getPrisma } from "./lib/db";

const EXCHANGE = "threaddash";
const QUEUE = "warehouse.order.placed";
const ROUTING_KEY = "order.placed";
const SLA_MINUTES = 45;

export async function handleOrderPlaced(payload: {
  orderId: string;
  warehouseId: string;
}): Promise<void> {
  const prisma = getPrisma();
  const items = await prisma.orderItem.findMany({ where: { orderId: payload.orderId } });
  const slaDeadline = new Date(Date.now() + SLA_MINUTES * 60 * 1000);

  await prisma.pickingTask.create({
    data: {
      orderId: payload.orderId,
      warehouseId: payload.warehouseId,
      status: "PENDING",
      slaDeadline,
      items: {
        create: items.map((item) => ({
          skuId: item.skuId,
          quantity: item.quantity,
          status: "PENDING",
        })),
      },
    },
  });
}

export async function startConsumer(): Promise<void> {
  const conn = await amqp.connect(
    process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672"
  );
  const ch = await conn.createChannel();
  await ch.assertExchange(EXCHANGE, "topic", { durable: true });
  const q = await ch.assertQueue(QUEUE, { durable: true });
  await ch.bindQueue(q.queue, EXCHANGE, ROUTING_KEY);

  ch.consume(q.queue, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      await handleOrderPlaced(payload);
      ch.ack(msg);
    } catch {
      ch.nack(msg, false, false);
    }
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd services/warehouse-service && npm test -- --testPathPattern=consumer
```

Expected: PASS — 2 tests passing

- [ ] **Step 7: Commit**

```bash
git add services/warehouse-service/src/lib/rabbitmq.ts \
        services/warehouse-service/src/lib/role.ts \
        services/warehouse-service/src/consumer.ts \
        services/warehouse-service/tests/consumer.test.ts
git commit -m "feat: warehouse RabbitMQ consumer — handleOrderPlaced creates PickingTask"
```

---

## Task 3: Picking queue routes

**Files:**
- Create: `services/warehouse-service/tests/picking.test.ts`
- Create: `services/warehouse-service/src/routes/picking.ts`

**Context:** Three routes mounted at `/picking-queue` in index.ts (wired in Task 5). All require `WAREHOUSE_STAFF` role via `requireRole` from `src/lib/role.ts`. `pack-ready` calls `axios.patch` to order-service. Tests mock `getPrisma`, mock `requireAuth` to inject a WAREHOUSE_STAFF user, and mock `axios`. The `$transaction` mock passes itself as the `tx` argument so nested calls resolve against the same mock.

- [ ] **Step 1: Write failing picking route tests**

Create `services/warehouse-service/tests/picking.test.ts`:

```typescript
jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("axios");
jest.mock("@threaddash/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: "staff-1", role: "WAREHOUSE_STAFF", phone: "+919876500002" };
    next();
  },
}));

import request from "supertest";
import axios from "axios";
import { getPrisma } from "../src/lib/db";

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;

let app: any;
beforeAll(async () => {
  app = (await import("../src/index")).default;
});

beforeEach(() => { jest.clearAllMocks(); });

const TASK_PENDING = {
  id: "task-1",
  orderId: "order-1",
  warehouseId: "wh-hsr-layout",
  status: "PENDING",
  slaDeadline: new Date(Date.now() + 30 * 60 * 1000),
  items: [
    { id: "item-1", skuId: "sku-os-s", quantity: 1, status: "PENDING", scannedAt: null },
  ],
};

const TASK_ALL_FOUND = {
  ...TASK_PENDING,
  status: "IN_PROGRESS",
  items: [
    { id: "item-1", skuId: "sku-os-s", quantity: 1, status: "FOUND", scannedAt: new Date() },
  ],
};

function makeMockPrisma() {
  const base: any = {
    pickingTask: {
      findMany: jest.fn().mockResolvedValue([TASK_PENDING]),
      findUnique: jest.fn().mockResolvedValue(TASK_PENDING),
      update: jest.fn().mockResolvedValue({}),
    },
    pickingItem: { update: jest.fn().mockResolvedValue({}) },
    inventory: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(base)),
  };
  return base;
}

describe("GET /picking-queue/:warehouseId", () => {
  it("returns tasks ordered by slaDeadline asc", async () => {
    const earlier = new Date(Date.now() + 10 * 60 * 1000);
    const later = new Date(Date.now() + 30 * 60 * 1000);
    const tasks = [
      { ...TASK_PENDING, id: "task-1", slaDeadline: earlier },
      { ...TASK_PENDING, id: "task-2", slaDeadline: later },
    ];
    const mockPrisma = makeMockPrisma();
    mockPrisma.pickingTask.findMany.mockResolvedValue(tasks);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).get("/picking-queue/wh-hsr-layout");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe("task-1");
    expect(mockPrisma.pickingTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { warehouseId: "wh-hsr-layout", status: { in: ["PENDING", "IN_PROGRESS"] } },
        orderBy: { slaDeadline: "asc" },
      })
    );
  });
});

describe("POST /picking-queue/:orderId/pick-item", () => {
  it("marks item FOUND and transitions task to IN_PROGRESS", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/picking-queue/order-1/pick-item")
      .send({ skuId: "sku-os-s", status: "FOUND" });

    expect(res.status).toBe(200);
    expect(mockPrisma.pickingItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-1" },
        data: expect.objectContaining({ status: "FOUND" }),
      })
    );
    expect(mockPrisma.pickingTask.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "IN_PROGRESS" } })
    );
  });

  it("marks item NOT_AVAILABLE", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/picking-queue/order-1/pick-item")
      .send({ skuId: "sku-os-s", status: "NOT_AVAILABLE" });

    expect(res.status).toBe(200);
    expect(mockPrisma.pickingItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "NOT_AVAILABLE" }) })
    );
  });

  it("returns 409 when item already scanned", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.pickingTask.findUnique.mockResolvedValue({
      ...TASK_PENDING,
      items: [{ ...TASK_PENDING.items[0], status: "FOUND" }],
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/picking-queue/order-1/pick-item")
      .send({ skuId: "sku-os-s", status: "FOUND" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already scanned/i);
  });

  it("returns 404 when task not found", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.pickingTask.findUnique.mockResolvedValue(null);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/picking-queue/order-999/pick-item")
      .send({ skuId: "sku-os-s", status: "FOUND" });

    expect(res.status).toBe(404);
  });

  it("returns 400 when status is invalid", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/picking-queue/order-1/pick-item")
      .send({ skuId: "sku-os-s", status: "MAYBE" });

    expect(res.status).toBe(400);
  });
});

describe("POST /picking-queue/:orderId/pack-ready", () => {
  it("packs task, confirms inventory, calls order-service READY_FOR_PICKUP", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.pickingTask.findUnique.mockResolvedValue(TASK_ALL_FOUND);
    mockGetPrisma.mockReturnValue(mockPrisma);
    mockAxios.patch = jest.fn().mockResolvedValue({ data: {} });

    const res = await request(app).post("/picking-queue/order-1/pack-ready");

    expect(res.status).toBe(200);
    expect(mockPrisma.pickingTask.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PACKED" } })
    );
    expect(mockPrisma.inventory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { skuId_warehouseId: { skuId: "sku-os-s", warehouseId: "wh-hsr-layout" } },
        data: { quantityReserved: { decrement: 1 } },
      })
    );
    expect(mockAxios.patch).toHaveBeenCalledWith(
      expect.stringContaining("/order-1/status"),
      { status: "READY_FOR_PICKUP" }
    );
  });

  it("returns 400 when any item still PENDING", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/picking-queue/order-1/pack-ready");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scanned/i);
  });

  it("returns 502 when order-service call fails; task is already PACKED", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.pickingTask.findUnique.mockResolvedValue(TASK_ALL_FOUND);
    mockGetPrisma.mockReturnValue(mockPrisma);
    mockAxios.patch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(app).post("/picking-queue/order-1/pack-ready");

    expect(res.status).toBe(502);
    expect(mockPrisma.pickingTask.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PACKED" } })
    );
  });

  it("returns 404 when task not found", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.pickingTask.findUnique.mockResolvedValue(null);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/picking-queue/order-999/pack-ready");

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/warehouse-service && npm test -- --testPathPattern=picking
```

Expected: FAIL — `Cannot find module '../src/routes/picking'`

- [ ] **Step 3: Implement picking routes**

Create `services/warehouse-service/src/routes/picking.ts`:

```typescript
import { Router } from "express";
import axios from "axios";
import { requireAuth } from "@threaddash/auth";
import { getPrisma } from "../lib/db";
import { requireRole } from "../lib/role";

const router = Router();
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL ?? "http://localhost:3001";
const requireWarehouseStaff = requireRole("WAREHOUSE_STAFF");

router.get("/:warehouseId", requireAuth, requireWarehouseStaff, async (req, res) => {
  const { warehouseId } = req.params;
  const prisma = getPrisma();
  const tasks = await prisma.pickingTask.findMany({
    where: { warehouseId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    orderBy: { slaDeadline: "asc" },
    include: { items: { include: { sku: true } } },
  });
  return res.json(tasks);
});

router.post("/:orderId/pick-item", requireAuth, requireWarehouseStaff, async (req, res) => {
  const { orderId } = req.params;
  const { skuId, status } = req.body as { skuId: string; status: string };

  if (!skuId || !["FOUND", "NOT_AVAILABLE"].includes(status)) {
    return res.status(400).json({ error: "skuId and status (FOUND|NOT_AVAILABLE) required" });
  }

  const prisma = getPrisma();
  const task = await prisma.pickingTask.findUnique({
    where: { orderId },
    include: { items: true },
  });
  if (!task) return res.status(404).json({ error: "PickingTask not found" });

  const item = task.items.find((i) => i.skuId === skuId);
  if (!item) return res.status(404).json({ error: "Item not found in task" });
  if (item.status !== "PENDING") return res.status(409).json({ error: "Item already scanned" });

  await prisma.$transaction(async (tx) => {
    await tx.pickingItem.update({
      where: { id: item.id },
      data: { status: status as "FOUND" | "NOT_AVAILABLE", scannedAt: new Date() },
    });
    if (task.status === "PENDING") {
      await tx.pickingTask.update({
        where: { id: task.id },
        data: { status: "IN_PROGRESS" },
      });
    }
  });

  return res.json({ success: true });
});

router.post("/:orderId/pack-ready", requireAuth, requireWarehouseStaff, async (req, res) => {
  const { orderId } = req.params;
  const prisma = getPrisma();

  const task = await prisma.pickingTask.findUnique({
    where: { orderId },
    include: { items: true },
  });
  if (!task) return res.status(404).json({ error: "PickingTask not found" });

  if (task.items.some((i) => i.status === "PENDING")) {
    return res.status(400).json({ error: "All items must be scanned before packing" });
  }

  const foundItems = task.items.filter((i) => i.status === "FOUND");
  const notAvailableItems = task.items.filter((i) => i.status === "NOT_AVAILABLE");

  await prisma.$transaction(async (tx) => {
    await tx.pickingTask.update({ where: { id: task.id }, data: { status: "PACKED" } });
    for (const item of foundItems) {
      await tx.inventory.update({
        where: { skuId_warehouseId: { skuId: item.skuId, warehouseId: task.warehouseId } },
        data: { quantityReserved: { decrement: item.quantity } },
      });
    }
    for (const item of notAvailableItems) {
      await tx.inventory.update({
        where: { skuId_warehouseId: { skuId: item.skuId, warehouseId: task.warehouseId } },
        data: {
          quantityReserved: { decrement: item.quantity },
          quantityAvailable: { increment: item.quantity },
        },
      });
    }
  });

  try {
    await axios.patch(`${ORDER_SERVICE_URL}/${orderId}/status`, { status: "READY_FOR_PICKUP" });
  } catch {
    return res.status(502).json({ error: "Order service unreachable" });
  }

  return res.json({ success: true });
});

export default router;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd services/warehouse-service && npm test -- --testPathPattern=picking
```

Expected: PASS — all picking tests green

- [ ] **Step 5: Commit**

```bash
git add services/warehouse-service/src/lib/role.ts \
        services/warehouse-service/src/routes/picking.ts \
        services/warehouse-service/tests/picking.test.ts
git commit -m "feat: warehouse picking queue routes (GET queue, pick-item, pack-ready)"
```

---

## Task 4: Returns route

**Files:**
- Create: `services/warehouse-service/tests/returns.test.ts`
- Create: `services/warehouse-service/src/routes/returns.ts`

**Context:** One endpoint `POST /receive` mounted at `/returns` in index.ts (wired in Task 5). Requires WAREHOUSE_STAFF. Creates a `Return` row with `refundAmount = 0` and `processedAt = now()`. If `condition === "GOOD"`, increments `quantityAvailable` for the SKU in the order's warehouse. The `Return` model has a unique constraint on `orderItemId` — checked before insert to return 409. The `OrderItem` is fetched with `include: { order: true }` to get `warehouseId`.

- [ ] **Step 1: Write failing returns tests**

Create `services/warehouse-service/tests/returns.test.ts`:

```typescript
jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("@threaddash/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: "staff-1", role: "WAREHOUSE_STAFF", phone: "+919876500002" };
    next();
  },
}));

import request from "supertest";
import { getPrisma } from "../src/lib/db";

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;

let app: any;
beforeAll(async () => {
  app = (await import("../src/index")).default;
});

beforeEach(() => { jest.clearAllMocks(); });

const ORDER_ITEM = {
  id: "item-1",
  orderId: "order-1",
  skuId: "sku-os-s",
  quantity: 1,
  order: { id: "order-1", warehouseId: "wh-hsr-layout" },
};

function makeMockPrisma() {
  const base: any = {
    orderItem: { findUnique: jest.fn().mockResolvedValue(ORDER_ITEM) },
    return: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "return-1" }),
    },
    inventory: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(base)),
  };
  return base;
}

describe("POST /returns/receive", () => {
  it("creates Return and restocks inventory for GOOD condition", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ orderItemId: "item-1", condition: "GOOD", reason: "Changed mind" });

    expect(res.status).toBe(200);
    expect(mockPrisma.return.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderItemId: "item-1",
          condition: "GOOD",
          refundAmount: 0,
          processedAt: expect.any(Date),
        }),
      })
    );
    expect(mockPrisma.inventory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { skuId_warehouseId: { skuId: "sku-os-s", warehouseId: "wh-hsr-layout" } },
        data: { quantityAvailable: { increment: 1 } },
      })
    );
  });

  it("creates Return but does NOT restock for DAMAGED condition", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ orderItemId: "item-1", condition: "DAMAGED" });

    expect(res.status).toBe(200);
    expect(mockPrisma.return.create).toHaveBeenCalled();
    expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
  });

  it("creates Return but does NOT restock for TAGS_MISSING condition", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ orderItemId: "item-1", condition: "TAGS_MISSING" });

    expect(res.status).toBe(200);
    expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
  });

  it("returns 409 when return already exists for this orderItemId", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.return.findUnique.mockResolvedValue({ id: "existing-return" });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ orderItemId: "item-1", condition: "GOOD" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("returns 404 when orderItem not found", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.orderItem.findUnique.mockResolvedValue(null);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ orderItemId: "bad-id", condition: "GOOD" });

    expect(res.status).toBe(404);
  });

  it("returns 400 when condition is invalid", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ orderItemId: "item-1", condition: "PERFECT" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when orderItemId is missing", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ condition: "GOOD" });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/warehouse-service && npm test -- --testPathPattern=returns
```

Expected: FAIL — `Cannot find module '../src/routes/returns'`

- [ ] **Step 3: Implement returns route**

Create `services/warehouse-service/src/routes/returns.ts`:

```typescript
import { Router } from "express";
import { requireAuth } from "@threaddash/auth";
import { getPrisma } from "../lib/db";
import { requireRole } from "../lib/role";

const router = Router();
const requireWarehouseStaff = requireRole("WAREHOUSE_STAFF");

router.post("/receive", requireAuth, requireWarehouseStaff, async (req, res) => {
  const { orderItemId, condition, reason, photoUrl } = req.body as {
    orderItemId: string;
    condition: string;
    reason?: string;
    photoUrl?: string;
  };

  if (!orderItemId || !["GOOD", "DAMAGED", "TAGS_MISSING"].includes(condition)) {
    return res.status(400).json({
      error: "orderItemId and condition (GOOD|DAMAGED|TAGS_MISSING) required",
    });
  }

  const prisma = getPrisma();

  const orderItem = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { order: true },
  });
  if (!orderItem) return res.status(404).json({ error: "OrderItem not found" });

  const existing = await prisma.return.findUnique({ where: { orderItemId } });
  if (existing) return res.status(409).json({ error: "Return already exists for this item" });

  await prisma.$transaction(async (tx) => {
    await tx.return.create({
      data: {
        orderId: orderItem.orderId,
        orderItemId,
        condition: condition as "GOOD" | "DAMAGED" | "TAGS_MISSING",
        reason: reason ?? null,
        photoUrl: photoUrl ?? null,
        refundAmount: 0,
        processedAt: new Date(),
      },
    });

    if (condition === "GOOD") {
      await tx.inventory.update({
        where: {
          skuId_warehouseId: {
            skuId: orderItem.skuId,
            warehouseId: orderItem.order.warehouseId,
          },
        },
        data: { quantityAvailable: { increment: 1 } },
      });
    }
  });

  return res.json({ success: true });
});

export default router;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd services/warehouse-service && npm test -- --testPathPattern=returns
```

Expected: PASS — all 7 returns tests green

- [ ] **Step 5: Commit**

```bash
git add services/warehouse-service/src/routes/returns.ts \
        services/warehouse-service/tests/returns.test.ts
git commit -m "feat: warehouse returns receive endpoint"
```

---

## Task 5: Wire index.ts and run full test suite

**Files:**
- Modify: `services/warehouse-service/src/index.ts`

**Context:** Current `src/index.ts` only mounts `/inventory`. Add `/picking-queue` and `/returns` routes and call `startConsumer()` in the `require.main === module` guard. `startConsumer()` is async — call with `.catch(console.error)` so a RabbitMQ failure at startup logs without crashing the process silently. The `require.main === module` guard prevents the consumer from starting during tests.

- [ ] **Step 1: Update index.ts**

Replace the full contents of `services/warehouse-service/src/index.ts` with:

```typescript
import express from "express";
import dotenv from "dotenv";
import inventoryRouter from "./routes/inventory";
import pickingRouter from "./routes/picking";
import returnsRouter from "./routes/returns";
import { startConsumer } from "./consumer";

dotenv.config();

const app = express();
const PORT = process.env.WAREHOUSE_SERVICE_PORT ?? 3002;
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "warehouse-service" })
);

app.use("/inventory", inventoryRouter);
app.use("/picking-queue", pickingRouter);
app.use("/returns", returnsRouter);

if (require.main === module) {
  startConsumer().catch(console.error);
  app.listen(PORT, () => console.log(`Warehouse Service on port ${PORT}`));
}

export default app;
```

- [ ] **Step 2: Run the full test suite**

```bash
cd services/warehouse-service && npm test
```

Expected:
```
PASS tests/consumer.test.ts
PASS tests/picking.test.ts
PASS tests/returns.test.ts

Test Suites: 3 passed, 3 total
Tests:       ~14 passed, ~14 total
```

If any test fails, fix it before proceeding. Do not commit a red suite.

- [ ] **Step 3: Verify service starts**

In a separate terminal:

```bash
cd services/warehouse-service && \
  DATABASE_URL="postgresql://threaddash:password@localhost:5432/threaddash_dev" \
  RABBITMQ_URL="amqp://guest:guest@localhost:5672" \
  JWT_SECRET="dev-secret-local" \
  npx ts-node-dev --respawn src/index.ts
```

Expected log:
```
Warehouse Service on port 3002
```

Then:
```bash
curl -s http://localhost:3002/health
```
Expected: `{"status":"ok","service":"warehouse-service"}`

Stop with Ctrl+C.

- [ ] **Step 4: Commit and tag**

```bash
git add services/warehouse-service/src/index.ts
git commit -m "feat: wire Phase 2 warehouse routes and consumer into index.ts"
git tag phase-2-complete
```

---

## Exit Criteria Checklist

- [ ] `npm test` in `services/warehouse-service` — all tests green
- [ ] `picking_tasks` and `picking_items` tables exist: `docker exec threaddash_postgres psql -U threaddash -d threaddash_dev -c "\dt picking*"`
- [ ] Service starts without error — `curl http://localhost:3002/health` returns 200
- [ ] RabbitMQ management UI (`http://localhost:15672`) shows `warehouse.order.placed` queue bound to `threaddash` exchange with routing key `order.placed`
- [ ] Tag `phase-2-complete` applied
