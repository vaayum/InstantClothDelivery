# ThreadDash — Implementation Build Order Design

**Date:** 2026-05-22
**Approach:** Backend Core First (Approach C)
**Context:** Solo developer; second developer may join at Phase 7

---

## Decision

Build the full backend before touching any app UI. Tackle the order state machine first — it is the highest-risk piece and everything else reacts to it. Apps are built last, in order of increasing complexity.

### Why not Approach A (pure risk-first)?
Same risk coverage as C but longest time before anything is demoable, and no natural handoff point for a second developer.

### Why not Approach B (thin vertical slice first)?
The Try Before You Keep payment model (pre-auth → partial capture) is fundamentally different from a direct-capture flow. Building the simple flow first forces a rework of the payment service when the Try flow is added.

---

## Phase Map

| Phase | Name | Primary Deliverable |
|-------|------|-------------------|
| 0 | Foundation | DB migrations, seed data, auth |
| 1 | Order State Machine | Full order lifecycle, SLA timers, event bus |
| 2 | Warehouse Service | Picking queue, inventory ops, returns |
| 3 | Routing Integration | OSRM/Maps wired into order creation + agent assignment |
| 4 | Agent Assignment | Scoring, 2-min acceptance window, ops escalation |
| 5 | Payment | Razorpay pre-auth, partial capture, instant refund |
| 6 | Notifications + Realtime | FCM/Twilio, Socket.io tracking, trial timer |
| 7 | Apps | Warehouse web → Customer app → Agent app → Admin |

**Second-developer handoff point:** Phase 7. Backend fully tested; one developer takes warehouse web + admin, the other takes customer + agent app.

---

## Phase 0 — Foundation

### Database
- Run `prisma migrate dev --name init`
- Seed script at `packages/database/src/seed.ts`: 1 zone, 1 warehouse (real Bengaluru coordinates), 10 products with 2–3 SKUs each, 5–10 units per SKU in inventory

### Auth (in api-gateway, no separate service)
- `POST /auth/send-otp` — phone number → 6-digit OTP in Redis (5-min TTL) → Twilio SMS
- `POST /auth/verify-otp` — validates OTP → JWT (HS256, payload: `{ userId, role, phone }`, 7-day expiry)
- JWT verification middleware in `packages/auth` — imported by all services

### Exit Criteria
- Prisma Studio shows seeded data
- `POST /auth/verify-otp` returns a valid JWT
- Protected route returns 401 without token

---

## Phase 1 — Order State Machine

### Order Creation (`POST /api/orders`)
1. Validate all SKUs exist and have available stock
2. Call `routing-service/select-warehouse` synchronously (uses Haversine in Phase 1; upgraded to OSRM in Phase 3)
3. Call `warehouse-service/inventory/reserve` atomically (fail whole order if any SKU unavailable)
4. Create `Order` + `OrderItem` rows in DB
5. Publish `ORDER_PLACED` to RabbitMQ
6. Return order with estimated delivery window

> **Phase 1 prerequisite:** Build `POST /warehouse/inventory/reserve` and `POST /warehouse/inventory/release` as the first two endpoints in warehouse-service before implementing order creation. These are simple atomic DB operations (no queue logic). The full picking queue, scanning, and returns are Phase 2.

### State Transition Engine
Single function `transitionOrder(orderId, newStatus, actor)` — validates legality, writes new status, publishes `ORDER_STATUS_CHANGED`. No direct DB writes to `orders.status` anywhere else.

### Valid Transitions
```
PENDING → WAREHOUSE_PROCESSING → READY_FOR_PICKUP → AGENT_ASSIGNED
→ AGENT_EN_ROUTE → ARRIVED → TRIAL_IN_PROGRESS → COMPLETED
PENDING → CANCELLED
ARRIVED → RESCHEDULED → AGENT_ASSIGNED (on re-dispatch)
```

### SLA Timers (Redis + node-cron)
- On `ORDER_PLACED`: Redis key expiring in 45 min
- node-cron job (1-min interval): publish `SLA_WARNING` at 80% (36 min), `SLA_BREACH` at 100%

### Try Before You Keep Endpoints
- `POST /orders/:id/trial/start` — transitions to `TRIAL_IN_PROGRESS`, sets 30-min Redis timer
- `POST /orders/:id/trial/complete` — body: `{ keptSkuIds[], returnedSkuIds[] }`; calls payment-service for partial capture; transitions to `COMPLETED`; publishes `ORDER_COMPLETED`

### Cancellation + Absent Customer
- `POST /orders/:id/cancel` — releases reserved inventory, triggers refund if payment captured
- `POST /orders/:id/mark-absent` — increments `absentAttempts`; on 3rd attempt charges INR 99 fee

### Exit Criteria
Full lifecycle via Postman: place order → warehouse picks → agent assigned → trial start → trial complete → partial capture. All transitions produce RabbitMQ events visible in management UI.

---

## Phase 2 — Warehouse Service

### RabbitMQ Consumer
On `ORDER_PLACED`: create picking task with 45-min SLA countdown.

### Endpoints
- `GET /warehouse/picking-queues/:warehouseId` — queue ordered by SLA urgency, aisle/shelf locations shown
- `POST /warehouse/picking-queues/:orderId/pick-item` — barcode scan; marks Found or Not Available
- `POST /warehouse/picking-queues/:orderId/pack-ready` — all items confirmed; triggers `READY_FOR_PICKUP` in order-service
- `POST /warehouse/returns/receive` — scan returned items, capture condition + photo URL, update inventory

### Inventory State
```
reserve:   quantityAvailable -= n, quantityReserved += n   (ORDER_PLACED)
confirm:   quantityReserved  -= n                          (pack-ready)
release:   quantityReserved  -= n, quantityAvailable += n  (cancellation)
restock:   quantityAvailable += n                          (return, condition = Good)
```

### Exit Criteria
Full picking flow via API. Inventory counts in Prisma Studio correct at each step.

---

## Phase 3 — Routing Integration

### OSRM Setup
- Enable `routing` docker-compose profile for local dev
- `ROUTING_PROVIDER` env var toggles between `osrm` and `google` (Google Maps Distance Matrix API as fallback)

### Integration Points
1. **Order creation** — order-service calls `POST routing-service/select-warehouse`; routing-service calls OSRM for real road ETAs (replaces Haversine estimate)
2. **Agent assignment** — on `READY_FOR_PICKUP`, order-service calls `POST routing-service/assign-agent` with available agents and coordinates

### Exit Criteria
Test order with real coordinates selects warehouse by road distance. Agent scoring uses real ETAs.

---

## Phase 4 — Agent Assignment

### Agent Status
- `PATCH /agents/:id/status` — AVAILABLE / BUSY / OFF_DUTY
- `PATCH /agents/:id/location` — GPS update (30s interval; stubbed with test script in this phase)

### Assignment Flow
Triggered on `READY_FOR_PICKUP`:
1. Fetch AVAILABLE agents within 8 km of warehouse
2. Call `routing-service/assign-agent` to score candidates
3. Create `DeliveryAssignment` (status: ASSIGNED)
4. Publish `NEW_ASSIGNMENT` event (Phase 6 sends push)
5. Set Redis key `assignment-timeout:{id}` with 2-min TTL

### Timeout Handling
Background job watches expired keys. On expiry: try next candidate. After 3 failures: publish `ASSIGNMENT_FAILED`, escalate to ops.

### Endpoints
- `POST /assignments/:id/accept` — status → ACCEPTED; Redis key cleared
- `POST /assignments/:id/decline` — triggers next candidate immediately

### Exit Criteria
3 test agents seeded. Place order. Correct agent selected. Decline → next agent tried. Timeout → fallback fires.

---

## Phase 5 — Payment

### Standard Order
`POST /payments/create-order` → Razorpay order (full amount) → client pays → webhook → `PAYMENT_CAPTURED` event to order-service.

### Try Order (Pre-auth)
1. Create Razorpay order with `payment_capture: 0`
2. After `trial/complete`: `POST /payments/capture` for kept items total
3. `POST /payments/refund` for returned items (< 2-min SLA)

### Webhook
`POST /payments/webhook` — verify `X-Razorpay-Signature`, update `orders.paymentStatus`, publish event.

### COD
Flag `paymentMethod: COD`, add INR 20 fee to `deliveryFee`, no Razorpay call.

### Exit Criteria
Full Try order: pre-auth → partial capture + instant refund. Razorpay dashboard shows correct authorisation and settlement.

---

## Phase 6 — Notifications + Realtime

### Notification Service
**14 notification types** across 3 audiences:
- 9 customer (Order Confirmed → Order Complete → Reschedule prompt)
- 5 warehouse (New Order → SLA Warning/Breach → Agent En Route → Return Arrived)
- 4 agent (New Assignment → Pickup Ready → Navigation Prompt → Day End Summary)

**Rules:** No customer push 22:00–08:00 IST. SMS fallback via Twilio for `AGENT_ARRIVED` and `TRIAL_WARNING` only.

### Realtime Service
Socket.io rooms keyed by `order:{orderId}`. Three broadcast types:
- `agent:location` — every 10s en route; agent app → HTTP → realtime-service → room
- `order:status` — on every state transition via `POST /realtime/emit/order-status`
- `trial:timer` — every 30s during trial + immediate 10-min warning broadcast

### Exit Criteria
Two browser tabs open (customer + ops). Place order. Status updates appear without polling. Trial timer ticks and fires 10-min warning.

---

## Phase 7 — Apps

### Build Order Within Phase
Warehouse web → Customer app → Agent app → Admin dashboard

### Warehouse Web (React + Vite, port 5173)
Three screens: picking queue (SLA urgency order, aisle/shelf locations), item scanning (barcode confirm), returns processing.
**Exit criteria:** Staff takes order from PENDING to READY_FOR_PICKUP using only the web app.

### Customer App (Expo + expo-router)
Six screens: onboarding (OTP + size profile + address), home (curated + search), product detail (Try badge), cart + checkout (payment method + Try disclosure), order tracking (live map + trial countdown), order history + rating.
**Note:** Build tracking screen last — depends on realtime service.
**Exit criteria:** Customer places Try order, watches agent on map, completes trial on device.

### Agent App (Expo + expo-location + expo-camera)
Five screens: status toggle (starts GPS), assignment notification (2-min countdown), warehouse navigation (QR scan), delivery + trial (barcode scan Kept/Returned), absent customer flow.
**Key risk:** iOS background location via `expo-task-manager`. Test on real device early.
**Exit criteria:** Agent completes trial with mixed keep/return; customer app reflects in real time.

### Admin Dashboard (React + Vite, port 5174)
Four views: live order map (colour-coded by status), SLA heatmap (per-warehouse breach rate), inventory management (per-SKU stock + reorder), user management (list/suspend customers and agents).
**Exit criteria:** Ops views live orders, identifies SLA breaches, adjusts inventory without DB access.

---

## Key Constraints

- Monorepo: Turborepo, all services share `tsconfig.base.json` and `packages/auth`
- Local infra: postgres (5432), redis (6380), rabbitmq (5672)
- Each phase independently testable via API before next begins
- No feature flags or backwards-compat shims — change code directly
- Second developer joins at Phase 7

---

## Out of Scope (Post-MVP)

- ThreadPass subscription billing
- ML demand forecasting  
- Personalization engine
- Multi-stop TSP routing
- Second metro city launch
- Brand partner portal
