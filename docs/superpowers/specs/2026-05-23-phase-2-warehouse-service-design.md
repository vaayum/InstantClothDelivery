# Phase 2 — Warehouse Service Design

**Date:** 2026-05-23
**Scope:** Picking queue, RabbitMQ consumer, returns processing

---

## Goal

Give warehouse-service an operational picking workflow: consume `order.placed` events to create picking tasks, expose a queue for warehouse staff to scan and pack items, notify order-service when an order is ready for pickup, and record returned items after trials.

---

## Architecture

Three new concerns added to warehouse-service, all isolated:

1. **RabbitMQ consumer** (`src/consumer.ts`) — exported `startConsumer()` subscribes to `order.placed` on the `threaddash` topic exchange. Creates one `PickingTask` + one `PickingItem` per order item, `slaDeadline = now + 45 min`. Called from `src/index.ts` at boot; skipped in tests unless explicitly invoked.

2. **Picking queue routes** (`src/routes/picking.ts`) — three endpoints covering the warehouse worker flow: fetch queue → scan items → mark packed. `pack-ready` calls order-service via HTTP `PATCH /:orderId/status → READY_FOR_PICKUP` and adjusts inventory. Protected by `requireAuth`; `WAREHOUSE_STAFF` role enforced at the route level.

3. **Returns route** (`src/routes/returns.ts`) — one endpoint to receive a returned item, record condition + photo URL, set `refundAmount = 0`, and restock inventory if condition is `GOOD`. Protected by `requireAuth`.

A `src/lib/rabbitmq.ts` singleton (mirrors order-service pattern) provides the shared amqplib channel.

> **Phase 4 note:** The `pack-ready` HTTP call to order-service will be replaced with a `order.ready_for_pickup` RabbitMQ publish when order-service gains its consumer in Phase 4.

---

## Data Model

### New Prisma migration: `add_picking_tasks`

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

### Inventory state transitions (full picture)

| Event | `quantityAvailable` | `quantityReserved` |
|---|---|---|
| `reserve` (Phase 1, order placed) | `-n` | `+n` |
| `confirm` (pack-ready, FOUND items) | no change | `-n` |
| `not-available` (pack-ready, NOT_AVAILABLE items) | `+n` | `-n` |
| `release` (Phase 1, cancellation) | `+n` | `-n` |
| `restock` (returns/receive, GOOD condition) | `+n` | no change |

---

## Endpoints

All endpoints require a valid JWT (`Authorization: Bearer <token>`). Picking and returns endpoints enforce `WAREHOUSE_STAFF` role.

### Picking Queue — `src/routes/picking.ts`

#### `GET /picking-queue/:warehouseId`
Returns all PickingTasks for that warehouse with status `PENDING` or `IN_PROGRESS`, ordered by `slaDeadline ASC` (most urgent first). Each task includes its items with SKU details.

**Response 200:**
```json
[
  {
    "id": "...",
    "orderId": "...",
    "warehouseId": "wh-hsr-layout",
    "status": "PENDING",
    "slaDeadline": "2026-05-23T17:10:00.000Z",
    "items": [
      { "id": "...", "skuId": "sku-os-s", "quantity": 1, "status": "PENDING", "scannedAt": null }
    ]
  }
]
```

#### `POST /picking-queue/:orderId/pick-item`
```json
{ "skuId": "sku-os-s", "status": "FOUND" }
```
Updates the matching PickingItem's `status` and `scannedAt`. Sets the parent PickingTask to `IN_PROGRESS` if still `PENDING`.

- **400** — missing `skuId` or invalid `status`
- **404** — no PickingTask exists for this `orderId`
- **409** — item already scanned

#### `POST /picking-queue/:orderId/pack-ready`
Validates all PickingItems are `FOUND` or `NOT_AVAILABLE` (400 if any still `PENDING`).

In a single `$transaction`:
- Sets PickingTask `status → PACKED`
- FOUND items: `quantityReserved -n` (confirm dispatch)
- NOT_AVAILABLE items: `quantityReserved -n`, `quantityAvailable +n` (return to shelf)

Then calls `PATCH http://localhost:3001/:orderId/status` with `{ status: "READY_FOR_PICKUP" }`.

- **400** — items still pending
- **404** — no PickingTask for this orderId
- **502** — order-service call failed (task stays PACKED for retry)

---

### Returns — `src/routes/returns.ts`

#### `POST /returns/receive`
```json
{
  "orderItemId": "...",
  "condition": "GOOD",
  "reason": "Customer changed mind",
  "photoUrl": "https://..."
}
```
Creates a `Return` record with `refundAmount = 0` and `processedAt = now()`. If `condition === "GOOD"`, increments `quantityAvailable +1` for that SKU/warehouse.

`refundAmount` is set to 0 here — payment-service fills the actual value in Phase 5.

- **400** — missing `orderItemId` or invalid `condition`
- **404** — `orderItemId` not found
- **409** — return already exists for this `orderItemId`

---

## RabbitMQ Consumer

**File:** `src/consumer.ts`
**Export:** `startConsumer(): Promise<void>`

Subscribes to routing key `order.placed` on the `threaddash` exchange. On each message:

1. Parse payload: `{ orderId, warehouseId, userId, isTryOrder, timestamp }`
2. Query `order_items` from Postgres where `orderId = payload.orderId`
3. Create `PickingTask` with `slaDeadline = now + 45 min`, `status = PENDING`
4. Create one `PickingItem` per order item, all `status = PENDING`
5. Ack the message

On parse or DB error: nack without requeue (dead-letter for manual inspection).

---

## File Structure

```
services/warehouse-service/src/
  consumer.ts          ← new: startConsumer() export
  lib/
    db.ts              ← existing
    rabbitmq.ts        ← new: amqplib channel singleton (mirrors order-service)
  routes/
    inventory.ts       ← existing (reserve/release)
    picking.ts         ← new: GET queue, POST pick-item, POST pack-ready
    returns.ts         ← new: POST receive
  index.ts             ← modified: wire new routes + startConsumer()

packages/database/prisma/
  schema.prisma        ← modified: add PickingTask, PickingItem models + enums
  migrations/          ← new migration: add_picking_tasks

services/warehouse-service/tests/
  consumer.test.ts     ← new
  picking.test.ts      ← new
  returns.test.ts      ← new
```

---

## Testing

All tests use real Postgres and real RabbitMQ (no mocks except axios for the order-service HTTP call in pack-ready).

### `tests/consumer.test.ts`
- Calls `startConsumer()`, publishes synthetic `order.placed` message
- Asserts PickingTask created with correct `warehouseId`, `slaDeadline` ≈ now + 45 min
- Asserts one PickingItem per order item, all `PENDING`

### `tests/picking.test.ts`
- `GET /picking-queue/:warehouseId` returns tasks sorted by slaDeadline ASC
- `POST pick-item` FOUND → status updated, task goes IN_PROGRESS
- `POST pick-item` NOT_AVAILABLE → status updated
- `POST pick-item` on already-scanned item → 409
- `POST pack-ready` with pending item → 400
- `POST pack-ready` all scanned → inventory updated, task PACKED, order-service called (axios mocked)
- `POST pack-ready` order-service returns non-2xx → 502, task stays PACKED
- Missing/invalid auth → 401

### `tests/returns.test.ts`
- GOOD condition → Return created, inventory restocked +1
- DAMAGED condition → Return created, no inventory change
- TAGS_MISSING condition → Return created, no inventory change
- Duplicate `orderItemId` → 409
- Missing auth → 401

---

## Exit Criteria

1. `npm test` in `services/warehouse-service` — all tests green
2. Start service, publish a synthetic `order.placed` to RabbitMQ → PickingTask visible in Prisma Studio
3. `GET /picking-queue/:warehouseId` returns the task
4. Scan all items via `pick-item`, then `pack-ready` → order transitions to `READY_FOR_PICKUP` in order-service
5. Inventory counts correct at each step in Prisma Studio
