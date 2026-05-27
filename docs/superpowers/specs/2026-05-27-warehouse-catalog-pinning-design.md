# Warehouse-Pinned Catalog Design

**Date:** 2026-05-27
**Status:** Approved for implementation
**Model:** Blinkit-style single-warehouse pinning

---

## Problem Statement

Today, ThreadDash discovers which warehouse to use at order-placement time. The routing call is inside the checkout hot-path, `has_stock: true` is hardcoded for every warehouse (actual inventory is never checked before routing), and if the reserve step fails the customer gets a cryptic error. There is no per-warehouse catalog filtering, no OOS surface at browse time, and no split-order or fallback logic.

This design fixes all of that by moving warehouse selection upstream — to address save — and filtering the product catalog from that point forward.

---

## Chosen Approach

**Approach 1 — Warehouse pinned at address save, catalog filtered server-side.**

The customer saves a delivery address → routing-service selects the best nearby warehouse → `pinnedWarehouseId` is stored on the user record. Every subsequent product browse, add-to-cart, and checkout reads from this stored value. The routing-service is removed from the checkout hot-path entirely.

---

## Architecture

```
Address save
    └─> routing-service /select-warehouse
    └─> users.pinnedWarehouseId = warehouse_id

Product browse
    └─> GET /api/products?categoryId=X
            API gateway injects pinnedWarehouseId from user session
    └─> product-service enriches each SKU with availability from warehouse-service
    └─> unavailable SKUs returned with available: false

Checkout
    └─> read user.pinnedWarehouseId  (no routing call)
    └─> pre-flight: GET /inventory/availability  (fast fail)
    └─> POST /inventory/reserve  (atomic)
    └─> create order with warehouseId = pinnedWarehouseId
```

---

## Data Model Changes

### `User` table — two new columns

```prisma
pinnedWarehouseId  String?
pinnedEtaMinutes   Int?
pinnedWarehouse    Warehouse? @relation(fields: [pinnedWarehouseId], references: [id])
```

Both are set together when a warehouse is pinned (at address save or store switch). `pinnedEtaMinutes` is the routing-service ETA at pinning time; it is returned at checkout as `etaMinutes` without recomputing. Nullable — null until the customer pins a warehouse.

No other schema changes required — the existing `Inventory` model with its `(skuId, warehouseId)` unique constraint already supports per-warehouse availability queries.

---

## API Changes

### Modified: `POST /api/addresses`

After saving the address, additionally:
1. Fetches all `ACTIVE` warehouses from DB
2. Calls `POST /routing/select-warehouse` with the address coords
3. On success: writes `pinnedWarehouseId` to user record
4. Returns `{ ...address, pinnedWarehouseId, etaMinutes, deliveryAvailable: true }`
5. On no warehouse in range: returns `{ ...address, pinnedWarehouseId: null, deliveryAvailable: false }` — address is saved, warehouse is not pinned

### New: `POST /api/addresses/:id/set-primary`

Activates a different saved address as the delivery address. Runs the same warehouse-pinning logic as address save. Response includes `warehouseChanged: boolean`. Client clears the AsyncStorage cart on `warehouseChanged: true`.

### New: `PATCH /api/users/me/pinned-warehouse`

Directly overrides the customer's pinned warehouse without changing their delivery address. Used by the "Switch store" prompt on the product screen. Body: `{ warehouseId: string }`. Writes `pinnedWarehouseId` and `pinnedEtaMinutes` to the user record. Response includes `{ warehouseChanged: boolean }`. Client clears cart on `warehouseChanged: true`.

This is distinct from `POST /api/addresses/:id/set-primary`: address changes trigger a full re-routing computation; this endpoint accepts an explicit warehouse ID chosen by the product-availability layer (which already knows the farther warehouse ID from the inventory lookup).

### Modified: `GET /api/products`

Accepts `warehouseId` as a query parameter. The API gateway resolves the calling user's `pinnedWarehouseId` via a single DB lookup (`SELECT pinnedWarehouseId FROM users WHERE id = :userId`) using the `userId` from the JWT, then appends it to the proxied request as `?warehouseId=`. Each product in the response includes per-SKU availability:

```json
{
  "id": "prod-1",
  "name": "Linen Shirt",
  "skus": [
    { "id": "sku-1", "size": "M", "color": "Navy", "available": true,  "quantityAvailable": 3 },
    { "id": "sku-2", "size": "L", "color": "Navy", "available": false, "quantityAvailable": 0 }
  ]
}
```

### New: `GET /api/inventory/availability`

```
Query params:
  warehouseId  string  (required)
  skuIds       string  (comma-separated, required)

Response:
  {
    [skuId]: { quantityAvailable: number, available: boolean }
  }
```

Used by two consumers:
- Product catalog enrichment (per-browse)
- Checkout pre-flight (before reserve)

### Modified: `POST /api/orders`

Removes the routing-service call. New flow:
1. Read `user.pinnedWarehouseId` — if null, return `400 { error: "no_delivery_address" }`
2. Call `GET /inventory/availability` for all cart SKUs — if any unavailable, return `409 { error: "items_unavailable", unavailableSkuIds: [...] }`
3. Call `POST /inventory/reserve` (unchanged)
4. Create order with `warehouseId = pinnedWarehouseId`
5. Return `{ orderId, razorpayOrderId, etaMinutes }` — `etaMinutes` sourced from a cached field on the warehouse record (set when warehouse is pinned, not recomputed at checkout)

---

## Customer Flows

### Onboarding gate

New users (or users with `pinnedWarehouseId = null`) see a location gate before the product catalog. Two paths:

- **Use current location** → `expo-location` reverse geocodes → address save flow → warehouse pinned → catalog opens
- **Enter address manually** → existing map picker (`profile.tsx`) → address save flow → warehouse pinned → catalog opens

The gate is one-time. On subsequent opens the app reads `pinnedWarehouseId` from the user session and goes straight to the filtered catalog.

### Unavailable SKU display

| Scenario | Display |
|---|---|
| SKU OOS at pinned warehouse, in stock elsewhere | Greyed out + "Switch store (+N min)" prompt |
| SKU OOS everywhere | Greyed out, "Unavailable near you" |
| SKU available | Normal, addable to cart |

"Switch store" triggers `PATCH /api/users/me/pinned-warehouse` with the farther warehouse's ID (already known from the inventory availability response). The customer sees an explicit confirmation: *"Switch store? Your cart will be cleared. Delivery will take ~N min instead of ~M min."* Their delivery address does not change.

### Cart invalidation on address change

`POST /api/addresses/:id/set-primary` returns `{ warehouseChanged: boolean }`. Client logic:

```
warehouseChanged === true
    → AsyncStorage.removeItem("cart_items")
    → show toast: "Cart cleared — new location set"
    → reload catalog
```

Cart state is client-only (AsyncStorage), so no server-side cart clearing is needed.

---

## Error Handling

| Scenario | Response | UX |
|---|---|---|
| No warehouse within 10 km of address | `address saved, deliveryAvailable: false` | "Delivery not available at this address yet" |
| Warehouse goes INACTIVE mid-session | `503 { error: "warehouse_unavailable" }` at checkout | "Your local store is temporarily unavailable. Please update your address." |
| SKU goes OOS between browse and checkout (race condition) | `409 { error: "items_unavailable", unavailableSkuIds }` | "X just went out of stock. Remove it to continue." |
| Checkout with no pinned warehouse | `400 { error: "no_delivery_address" }` | Redirect to address/onboarding flow |
| Reserve fails after pre-flight passes (tight race) | `409` from reserve, same shape | Same client handler as pre-flight 409 |

---

## Routing Service Changes

None. `POST /routing/select-warehouse` is called from a new location (address save in order-service) but the endpoint itself is unchanged. The only behavioral change is that `has_stock: true` is still passed at pinning time (we are selecting the best geographic warehouse, not filtering by specific SKUs here — SKU-level availability is handled separately via the inventory endpoint).

---

## Files Affected

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `pinnedWarehouseId`, `pinnedEtaMinutes` to `User` model + relation |
| `prisma/migrations/` | New migration for both columns |
| `services/order-service/src/routes/orders.ts` | Remove routing call; add availability pre-flight; read pinnedWarehouseId + pinnedEtaMinutes |
| `services/order-service/src/routes/addresses.ts` | After save: call routing, write pinnedWarehouseId + pinnedEtaMinutes; new `POST /:id/set-primary` handler |
| `services/order-service/src/routes/users.ts` | New `PATCH /users/me/pinned-warehouse` handler (store-switch without address change) |
| `services/warehouse-service/src/routes/inventory.ts` | New `GET /availability` endpoint |
| `services/api-gateway/src/routes/auth.ts` | DB lookup of `pinnedWarehouseId` by userId; append `?warehouseId=` to proxied product requests |
| `apps/customer-app/app/(tabs)/index.tsx` | Onboarding gate; consume availability fields on SKUs; "Switch store" prompt |
| `apps/customer-app/app/(tabs)/profile.tsx` | "Set primary" address action; warehouseChanged cart clear |
| `apps/customer-app/app/(tabs)/cart.tsx` | Block OOS add-to-cart; show unavailability reason |
| `apps/customer-app/app/context/CartContext.tsx` | Clear cart on `warehouseChanged` signal |

---

## Out of Scope

- Split orders across multiple warehouses — single-warehouse only by design
- Partial fulfillment (ship available items, refund the rest)
- Scheduled restocking notifications ("notify me when available")
- Admin-initiated re-pinning when a new warehouse opens near existing users

---

## Success Criteria

1. Customers with a pinned warehouse see only available-at-their-warehouse SKUs in the catalog (unavailable ones greyed, not hidden)
2. Checkout never fails due to a routing error — routing is out of the checkout path
3. An OOS race condition at checkout returns a clear, actionable `409` with the specific SKU IDs
4. Changing delivery address clears the cart and re-pins the warehouse atomically
5. New users cannot access the catalog without first setting a delivery address
