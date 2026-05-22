# Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the database schema, populate realistic seed data, and add phone-OTP authentication to the api-gateway so every subsequent phase has a working data layer and auth primitives.

**Architecture:** Three sequential layers: (1) Prisma migrations bring the schema live and seed data populates one Bengaluru zone, warehouse, and 10 products; (2) the new `@threaddash/auth` package provides `signJwt`, `verifyJwt`, and an Express `requireAuth` middleware imported by all future services; (3) `/auth/send-otp` + `/auth/verify-otp` routes land in the api-gateway, auto-creating a `User` row on first login and returning a JWT.

**Tech Stack:** Prisma 5 + PostgreSQL 16 PostGIS, Redis 7 (ioredis, host port 6380), Express 4, jsonwebtoken 9, Twilio (optional — skipped when env vars absent), Jest 29 + ts-jest 29 + supertest 7, TypeScript 5

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `infrastructure/scripts/setup-dev.sh` | Fix Redis port annotation 6379 → 6380 |
| Create | `packages/auth/package.json` | Package definition for `@threaddash/auth` |
| Create | `packages/auth/tsconfig.json` | TypeScript config extending base |
| Create | `packages/auth/jest.config.js` | Jest / ts-jest config |
| Create | `packages/auth/src/index.ts` | `signJwt`, `verifyJwt`, `requireAuth`, `JwtPayload` |
| Create | `packages/auth/tests/jwt.test.ts` | Unit tests for all three exports |
| Create | `packages/database/src/index.ts` | Prisma singleton export |
| Create | `packages/database/src/seed.ts` | 1 zone · 1 warehouse · 10 products · 26 SKUs · inventory |
| Modify | `packages/database/package.json` | Add `main` field and `build` script |
| Create | `services/api-gateway/src/lib/redis.ts` | ioredis singleton |
| Create | `services/api-gateway/src/lib/twilio.ts` | `sendSms` helper (no-ops without credentials) |
| Create | `services/api-gateway/src/routes/auth.ts` | POST /auth/send-otp · POST /auth/verify-otp |
| Create | `services/api-gateway/jest.config.js` | Jest / ts-jest config with module name mapper |
| Create | `services/api-gateway/tests/auth.test.ts` | Supertest tests for auth routes + protected route |
| Modify | `services/api-gateway/src/index.ts` | Export app, mount /auth router, add /api/me |
| Modify | `services/api-gateway/package.json` | Add `@threaddash/auth`, `@prisma/client`, `twilio`, jest + test deps |

---

## Task 1: Fix Redis port annotation in setup-dev.sh

**Files:**
- Modify: `infrastructure/scripts/setup-dev.sh`

- [ ] **Step 1: Fix the annotation**

In `infrastructure/scripts/setup-dev.sh`, change:

```
echo "  Redis:     localhost:6379"
```

to:

```
echo "  Redis:     localhost:6380"
```

- [ ] **Step 2: Commit**

```bash
git add infrastructure/scripts/setup-dev.sh
git commit -m "fix: correct Redis port annotation in setup-dev.sh (host port is 6380)"
```

---

## Task 2: @threaddash/auth package

**Files:**
- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/jest.config.js`
- Create: `packages/auth/tests/jwt.test.ts`
- Create: `packages/auth/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/auth/tests/jwt.test.ts`:

```typescript
import jwt from "jsonwebtoken";
import { signJwt, verifyJwt, requireAuth } from "../src/index";
import type { JwtPayload } from "../src/index";
import type { Request, Response, NextFunction } from "express";

const SECRET = "test-secret-phase0";

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
});

describe("signJwt", () => {
  it("returns a string", () => {
    const token = signJwt({ userId: "u1", role: "CUSTOMER", phone: "+919999999999" });
    expect(typeof token).toBe("string");
  });

  it("encodes expected payload", () => {
    const input: JwtPayload = { userId: "u1", role: "CUSTOMER", phone: "+919999999999" };
    const token = signJwt(input);
    const decoded = jwt.verify(token, SECRET) as JwtPayload;
    expect(decoded.userId).toBe("u1");
    expect(decoded.role).toBe("CUSTOMER");
    expect(decoded.phone).toBe("+919999999999");
  });
});

describe("verifyJwt", () => {
  it("decodes a valid token", () => {
    const token = signJwt({ userId: "u2", role: "AGENT", phone: "+918888888888" });
    const payload = verifyJwt(token);
    expect(payload.userId).toBe("u2");
    expect(payload.role).toBe("AGENT");
  });

  it("throws on tampered token", () => {
    expect(() => verifyJwt("not.a.real.token")).toThrow();
  });

  it("throws on expired token", () => {
    const expired = jwt.sign(
      { userId: "u3", role: "CUSTOMER", phone: "+917777777777" },
      SECRET,
      { expiresIn: -1 }
    );
    expect(() => verifyJwt(expired)).toThrow();
  });
});

describe("requireAuth middleware", () => {
  const mockNext = jest.fn() as unknown as NextFunction;

  function mockRes(): Response {
    const res = {} as Response;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  function mockReq(headers: Record<string, string> = {}): Request {
    return { headers } as unknown as Request;
  }

  beforeEach(() => jest.clearAllMocks());

  it("returns 401 with no Authorization header", () => {
    requireAuth(mockReq(), mockRes(), mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("returns 401 for a non-Bearer scheme", () => {
    requireAuth(mockReq({ authorization: "Basic dXNlcjpwYXNz" }), mockRes(), mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid token", () => {
    requireAuth(mockReq({ authorization: "Bearer garbage.token.here" }), mockRes(), mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("calls next() and attaches user for a valid token", () => {
    const token = signJwt({ userId: "u4", role: "ADMIN", phone: "+916666666666" });
    const req = mockReq({ authorization: `Bearer ${token}` });
    requireAuth(req, mockRes(), mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect((req as any).user.userId).toBe("u4");
    expect((req as any).user.role).toBe("ADMIN");
  });
});
```

- [ ] **Step 2: Create package.json**

Create `packages/auth/package.json`:

```json
{
  "name": "@threaddash/auth",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "jest --no-coverage"
  },
  "dependencies": {
    "jsonwebtoken": "^9.0.0",
    "express": "^4.19.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/jest": "^29.0.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/node": "^20.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Create `packages/auth/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create jest.config.js**

Create `packages/auth/jest.config.js`:

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
};
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

Expected: workspace installs complete; `packages/auth/node_modules` populated.

- [ ] **Step 6: Run tests to verify they fail**

```bash
cd packages/auth && npx jest --no-coverage 2>&1 | tail -5
```

Expected:
```
FAIL tests/jwt.test.ts
  ● Test suite failed to run
    Cannot find module '../src/index'
```

- [ ] **Step 7: Implement src/index.ts**

Create `packages/auth/src/index.ts`:

```typescript
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export interface JwtPayload {
  userId: string;
  role: string;
  phone: string;
}

export function signJwt(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function verifyJwt(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");
  return jwt.verify(token, secret) as JwtPayload;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed token" });
    return;
  }
  try {
    const token = header.slice(7);
    const payload = verifyJwt(token);
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd packages/auth && npx jest --no-coverage
```

Expected:
```
PASS tests/jwt.test.ts
  signJwt
    ✓ returns a string
    ✓ encodes expected payload
  verifyJwt
    ✓ decodes a valid token
    ✓ throws on tampered token
    ✓ throws on expired token
  requireAuth middleware
    ✓ returns 401 with no Authorization header
    ✓ returns 401 for a non-Bearer scheme
    ✓ returns 401 for an invalid token
    ✓ calls next() and attaches user for a valid token

Tests: 9 passed, 9 total
```

- [ ] **Step 9: Commit**

```bash
cd ../.. && git add packages/auth
git commit -m "feat: add @threaddash/auth package with signJwt, verifyJwt, requireAuth"
```

---

## Task 3: Database prisma singleton and seed script

**Files:**
- Create: `packages/database/src/index.ts`
- Create: `packages/database/src/seed.ts`
- Modify: `packages/database/package.json`

- [ ] **Step 1: Create packages/database/src/index.ts**

```typescript
import { PrismaClient } from "@prisma/client";

export { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["error"] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 2: Create packages/database/src/seed.ts**

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SkuSeed = { id: string; size: string; color: string; barcode: string };
type ProductSeed = {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  skus: SkuSeed[];
};

const products: ProductSeed[] = [
  {
    id: "prod-oxford-shirt",
    name: "Classic Oxford Shirt",
    brand: "H&M",
    category: "Shirts",
    price: 149900,
    skus: [
      { id: "sku-os-s", size: "S", color: "White", barcode: "HMOS-WHT-S" },
      { id: "sku-os-m", size: "M", color: "White", barcode: "HMOS-WHT-M" },
      { id: "sku-os-l", size: "L", color: "White", barcode: "HMOS-WHT-L" },
    ],
  },
  {
    id: "prod-slim-chinos",
    name: "Slim Fit Chinos",
    brand: "Zara",
    category: "Trousers",
    price: 199900,
    skus: [
      { id: "sku-sc-30", size: "30", color: "Navy", barcode: "ZARC-NAV-30" },
      { id: "sku-sc-32", size: "32", color: "Navy", barcode: "ZARC-NAV-32" },
    ],
  },
  {
    id: "prod-floral-dress",
    name: "Floral Wrap Dress",
    brand: "Mango",
    category: "Dresses",
    price: 249900,
    skus: [
      { id: "sku-fd-s", size: "S", color: "Floral Print", barcode: "MNFD-FLR-S" },
      { id: "sku-fd-m", size: "M", color: "Floral Print", barcode: "MNFD-FLR-M" },
    ],
  },
  {
    id: "prod-crew-tee",
    name: "Crew Neck T-Shirt",
    brand: "Uniqlo",
    category: "T-Shirts",
    price: 99900,
    skus: [
      { id: "sku-ct-m", size: "M", color: "Black", barcode: "UNBT-BLK-M" },
      { id: "sku-ct-l", size: "L", color: "Black", barcode: "UNBT-BLK-L" },
      { id: "sku-ct-xl", size: "XL", color: "Black", barcode: "UNBT-BLK-XL" },
    ],
  },
  {
    id: "prod-linen-kurta",
    name: "Linen Straight Kurta",
    brand: "Fabindia",
    category: "Ethnic",
    price: 179900,
    skus: [
      { id: "sku-lk-s", size: "S", color: "Beige", barcode: "FABK-BEI-S" },
      { id: "sku-lk-m", size: "M", color: "Beige", barcode: "FABK-BEI-M" },
    ],
  },
  {
    id: "prod-dark-jeans",
    name: "High-Rise Skinny Jeans",
    brand: "Levis",
    category: "Jeans",
    price: 299900,
    skus: [
      { id: "sku-dj-28", size: "28", color: "Dark Blue", barcode: "LEVJ-DBL-28" },
      { id: "sku-dj-30", size: "30", color: "Dark Blue", barcode: "LEVJ-DBL-30" },
    ],
  },
  {
    id: "prod-maxi-dress",
    name: "Printed Maxi Dress",
    brand: "AND",
    category: "Dresses",
    price: 229900,
    skus: [
      { id: "sku-md-m", size: "M", color: "Geometric Print", barcode: "ANDM-GEO-M" },
      { id: "sku-md-l", size: "L", color: "Geometric Print", barcode: "ANDM-GEO-L" },
    ],
  },
  {
    id: "prod-polo-shirt",
    name: "Classic Polo Shirt",
    brand: "Arrow",
    category: "Polo",
    price: 179900,
    skus: [
      { id: "sku-ps-m", size: "M", color: "Grey", barcode: "ARRP-GRY-M" },
      { id: "sku-ps-l", size: "L", color: "Grey", barcode: "ARRP-GRY-L" },
      { id: "sku-ps-xl", size: "XL", color: "Grey", barcode: "ARRP-GRY-XL" },
    ],
  },
  {
    id: "prod-salwar-suit",
    name: "Embroidered Salwar Suit Set",
    brand: "Biba",
    category: "Ethnic",
    price: 349900,
    skus: [
      { id: "sku-ss-s", size: "S", color: "Turquoise", barcode: "BIBS-TRQ-S" },
      { id: "sku-ss-m", size: "M", color: "Turquoise", barcode: "BIBS-TRQ-M" },
    ],
  },
  {
    id: "prod-cargo-shorts",
    name: "Utility Cargo Shorts",
    brand: "Roadster",
    category: "Shorts",
    price: 149900,
    skus: [
      { id: "sku-cs-30", size: "30", color: "Olive", barcode: "RDCS-OLV-30" },
      { id: "sku-cs-32", size: "32", color: "Olive", barcode: "RDCS-OLV-32" },
    ],
  },
];

async function main(): Promise<void> {
  const zone = await prisma.zone.upsert({
    where: { id: "zone-bengaluru-central" },
    update: {},
    create: {
      id: "zone-bengaluru-central",
      name: "Bengaluru Central",
      centerLat: 12.9716,
      centerLng: 77.5946,
      radiusKm: 5.0,
    },
  });
  console.log("Zone:", zone.name);

  const warehouse = await prisma.warehouse.upsert({
    where: { id: "wh-hsr-layout" },
    update: {},
    create: {
      id: "wh-hsr-layout",
      name: "ThreadDash HSR Hub",
      zoneId: zone.id,
      lat: 12.9116,
      lng: 77.6389,
      address: "23 HSR Layout Sector 6, Bengaluru 560102",
      capacitySqFt: 4000,
    },
  });
  console.log("Warehouse:", warehouse.name);

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category,
        price: p.price,
        images: [],
      },
    });

    for (const s of p.skus) {
      const sku = await prisma.sku.upsert({
        where: { id: s.id },
        update: {},
        create: {
          id: s.id,
          productId: product.id,
          size: s.size,
          color: s.color,
          barcode: s.barcode,
        },
      });

      await prisma.inventory.upsert({
        where: { skuId_warehouseId: { skuId: sku.id, warehouseId: warehouse.id } },
        update: {},
        create: {
          skuId: sku.id,
          warehouseId: warehouse.id,
          quantityAvailable: 8,
          quantityReserved: 0,
          reorderThreshold: 3,
        },
      });
    }

    console.log(`  Product seeded: ${product.name} (${p.skus.length} SKUs)`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("\nSeed complete.");
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 3: Update packages/database/package.json**

Full replacement:

```json
{
  "name": "@threaddash/database",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:migrate:prod": "prisma migrate deploy",
    "db:push": "prisma db push",
    "db:seed": "ts-node src/seed.ts",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^5.14.0"
  },
  "devDependencies": {
    "prisma": "^5.14.0",
    "ts-node": "^10.9.0",
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 4: Start infrastructure**

```bash
docker compose up -d postgres redis rabbitmq
```

Expected: containers `threaddash_postgres`, `threaddash_redis`, `threaddash_rabbitmq` start.

- [ ] **Step 5: Run the migration**

```bash
cd packages/database && npx prisma migrate dev --name init
```

Expected:
```
Applying migration `20260522000000_init`
Your database is now in sync with your schema.
```

- [ ] **Step 6: Generate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client (v5.x.x)`

- [ ] **Step 7: Run the seed**

```bash
npm run db:seed
```

Expected:
```
Zone: Bengaluru Central
Warehouse: ThreadDash HSR Hub
  Product seeded: Classic Oxford Shirt (3 SKUs)
  Product seeded: Slim Fit Chinos (2 SKUs)
  Product seeded: Floral Wrap Dress (2 SKUs)
  Product seeded: Crew Neck T-Shirt (3 SKUs)
  Product seeded: Linen Straight Kurta (2 SKUs)
  Product seeded: High-Rise Skinny Jeans (2 SKUs)
  Product seeded: Printed Maxi Dress (2 SKUs)
  Product seeded: Classic Polo Shirt (3 SKUs)
  Product seeded: Embroidered Salwar Suit Set (2 SKUs)
  Product seeded: Utility Cargo Shorts (2 SKUs)

Seed complete.
```

- [ ] **Step 8: Verify in Prisma Studio**

```bash
npx prisma studio
```

Open `http://localhost:5555`. Confirm:
- `zones`: 1 row — "Bengaluru Central"
- `warehouses`: 1 row — "ThreadDash HSR Hub"
- `products`: 10 rows
- `skus`: 26 rows
- `inventory`: 26 rows, all `quantityAvailable = 8`

Press Ctrl+C to exit.

- [ ] **Step 9: Commit**

```bash
cd ../.. && git add packages/database
git commit -m "feat: add Prisma singleton and seed (1 zone, 1 warehouse, 10 products, 26 SKUs)"
```

---

## Task 4: api-gateway auth infrastructure

**Files:**
- Modify: `services/api-gateway/package.json`
- Create: `services/api-gateway/src/lib/redis.ts`
- Create: `services/api-gateway/src/lib/twilio.ts`

- [ ] **Step 1: Update services/api-gateway/package.json**

Full replacement:

```json
{
  "name": "@threaddash/api-gateway",
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
    "express-rate-limit": "^7.3.0",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "jsonwebtoken": "^9.0.0",
    "http-proxy-middleware": "^3.0.0",
    "ioredis": "^5.4.0",
    "twilio": "^5.0.0",
    "dotenv": "^16.4.0",
    "winston": "^3.13.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.0",
    "@types/express": "^4.17.0",
    "@types/jest": "^29.0.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/node": "^20.0.0",
    "@types/supertest": "^6.0.0",
    "jest": "^29.0.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.0.0",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: `twilio`, `jest`, `supertest`, `ts-jest` installed across workspace.

- [ ] **Step 3: Create services/api-gateway/src/lib/redis.ts**

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

- [ ] **Step 4: Create services/api-gateway/src/lib/twilio.ts**

```typescript
import twilio from "twilio";

export async function sendSms(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const from = process.env.TWILIO_PHONE_NUMBER ?? "";

  if (!sid || !token || !from || !sid.startsWith("AC")) {
    console.log(`[twilio] no credentials — OTP for ${to}: ${body}`);
    return;
  }

  const client = twilio(sid, token);
  await client.messages.create({ body, from, to });
}
```

- [ ] **Step 5: Commit**

```bash
git add services/api-gateway/package.json services/api-gateway/src/lib
git commit -m "feat: add Redis singleton and Twilio SMS helper to api-gateway"
```

---

## Task 5: api-gateway auth routes

**Files:**
- Create: `services/api-gateway/jest.config.js`
- Create: `services/api-gateway/tests/auth.test.ts`
- Create: `services/api-gateway/src/routes/auth.ts`

- [ ] **Step 1: Create jest.config.js**

Create `services/api-gateway/jest.config.js`:

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^@threaddash/auth$": "<rootDir>/../../packages/auth/src/index.ts",
  },
};
```

- [ ] **Step 2: Write the failing tests**

Create `services/api-gateway/tests/auth.test.ts`:

```typescript
import request from "supertest";
import express from "express";

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn().mockResolvedValue("OK");
const mockRedisDel = jest.fn().mockResolvedValue(1);

jest.mock("../src/lib/redis", () => ({
  getRedis: () => ({ get: mockRedisGet, set: mockRedisSet, del: mockRedisDel }),
}));

jest.mock("../src/lib/twilio", () => ({
  sendSms: jest.fn().mockResolvedValue(undefined),
}));

const mockUserFindUnique = jest.fn();
const mockUserCreate = jest.fn();
jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    user: { findUnique: mockUserFindUnique, create: mockUserCreate },
  })),
}));

process.env.JWT_SECRET = "test-secret-auth-routes";

import authRouter from "../src/routes/auth";

const app = express();
app.use(express.json());
app.use("/auth", authRouter);

const PHONE = "+919876543210";
const OTP = "654321";
const USER = { id: "user-uuid-1", phone: PHONE, role: "CUSTOMER" };

beforeEach(() => jest.clearAllMocks());

describe("POST /auth/send-otp", () => {
  it("returns 400 for missing phone", async () => {
    const res = await request(app).post("/auth/send-otp").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid phone format", async () => {
    const res = await request(app).post("/auth/send-otp").send({ phone: "abc" });
    expect(res.status).toBe(400);
  });

  it("stores OTP in Redis and returns 200 for a valid phone", async () => {
    const res = await request(app).post("/auth/send-otp").send({ phone: PHONE });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("OTP sent");
    expect(mockRedisSet).toHaveBeenCalledWith(
      `otp:${PHONE}`,
      expect.stringMatching(/^\d{6}$/),
      "EX",
      300
    );
  });
});

describe("POST /auth/verify-otp", () => {
  it("returns 400 for missing otp", async () => {
    const res = await request(app).post("/auth/verify-otp").send({ phone: PHONE });
    expect(res.status).toBe(400);
  });

  it("returns 401 when no OTP in Redis", async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    const res = await request(app).post("/auth/verify-otp").send({ phone: PHONE, otp: OTP });
    expect(res.status).toBe(401);
  });

  it("returns 401 when OTP does not match", async () => {
    mockRedisGet.mockResolvedValueOnce("000000");
    const res = await request(app).post("/auth/verify-otp").send({ phone: PHONE, otp: OTP });
    expect(res.status).toBe(401);
  });

  it("returns JWT and existing user on correct OTP", async () => {
    mockRedisGet.mockResolvedValueOnce(OTP);
    mockUserFindUnique.mockResolvedValueOnce(USER);
    const res = await request(app).post("/auth/verify-otp").send({ phone: PHONE, otp: OTP });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.id).toBe(USER.id);
    expect(mockRedisDel).toHaveBeenCalledWith(`otp:${PHONE}`);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("creates a new user on first login", async () => {
    const newUser = { id: "user-new", phone: PHONE, role: "CUSTOMER" };
    mockRedisGet.mockResolvedValueOnce(OTP);
    mockUserFindUnique.mockResolvedValueOnce(null);
    mockUserCreate.mockResolvedValueOnce(newUser);
    const res = await request(app).post("/auth/verify-otp").send({ phone: PHONE, otp: OTP });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("user-new");
    expect(mockUserCreate).toHaveBeenCalledWith({
      data: { phone: PHONE, name: "New User" },
    });
  });
});

describe("GET /api/me via requireAuth", () => {
  let meApp: ReturnType<typeof express>;

  beforeAll(async () => {
    const { default: mainApp } = await import("../src/index");
    meApp = mainApp as ReturnType<typeof express>;
  });

  it("returns 401 without Authorization header", async () => {
    const res = await request(meApp).get("/api/me");
    expect(res.status).toBe(401);
  });

  it("returns 200 with user payload for a valid JWT", async () => {
    const { signJwt } = await import("@threaddash/auth");
    const token = signJwt({ userId: "u5", role: "CUSTOMER", phone: "+910000000000" });
    const res = await request(meApp).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe("u5");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd services/api-gateway && npx jest --no-coverage 2>&1 | tail -5
```

Expected:
```
FAIL tests/auth.test.ts
  ● Test suite failed to run
    Cannot find module '../src/routes/auth'
```

- [ ] **Step 4: Create services/api-gateway/src/routes/auth.ts**

```typescript
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { signJwt } from "@threaddash/auth";
import { getRedis } from "../lib/redis";
import { sendSms } from "../lib/twilio";

const router = Router();
const prisma = new PrismaClient();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post("/send-otp", async (req, res): Promise<void> => {
  const { phone } = req.body as { phone?: string };
  if (!phone || !/^\+?[1-9]\d{7,14}$/.test(phone)) {
    res.status(400).json({ error: "Invalid phone number" });
    return;
  }
  const otp = generateOtp();
  const redis = getRedis();
  await redis.set(`otp:${phone}`, otp, "EX", 300);
  await sendSms(phone, `Your ThreadDash OTP is ${otp}. Valid for 5 minutes.`);
  res.json({ message: "OTP sent" });
});

router.post("/verify-otp", async (req, res): Promise<void> => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };
  if (!phone || !otp) {
    res.status(400).json({ error: "phone and otp are required" });
    return;
  }
  const redis = getRedis();
  const stored = await redis.get(`otp:${phone}`);
  if (!stored || stored !== otp) {
    res.status(401).json({ error: "Invalid or expired OTP" });
    return;
  }
  await redis.del(`otp:${phone}`);

  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({ data: { phone, name: "New User" } });
  }

  const token = signJwt({ userId: user.id, role: user.role, phone: user.phone });
  res.json({ token, user: { id: user.id, role: user.role, phone: user.phone } });
});

export default router;
```

- [ ] **Step 5: Run the send-otp and verify-otp tests (the /api/me tests will still fail — that is expected)**

```bash
cd services/api-gateway && npx jest --no-coverage --testNamePattern="send-otp|verify-otp" 2>&1 | tail -10
```

Expected: all 8 send-otp + verify-otp tests pass.

- [ ] **Step 6: Commit**

```bash
cd ../.. && git add services/api-gateway/src/routes/auth.ts services/api-gateway/jest.config.js services/api-gateway/tests
git commit -m "feat: add /auth/send-otp and /auth/verify-otp routes to api-gateway"
```

---

## Task 6: Wire auth router into api-gateway and export app

**Files:**
- Modify: `services/api-gateway/src/index.ts`

The current `index.ts` calls `app.listen()` unconditionally, blocking tests from importing the app. Refactor: export the app and guard the `listen()` call behind `require.main === module`.

- [ ] **Step 1: Rewrite services/api-gateway/src/index.ts**

```typescript
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import dotenv from "dotenv";
import { requireAuth } from "@threaddash/auth";
import authRouter from "./routes/auth";

dotenv.config();

const app = express();
const PORT = process.env.API_GATEWAY_PORT ?? 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

app.use("/auth", authRouter);

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "api-gateway", ts: new Date().toISOString() })
);

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: (req as any).user });
});

const routes: Record<string, string> = {
  "/api/orders":        `http://localhost:${process.env.ORDER_SERVICE_PORT ?? 3001}`,
  "/api/warehouse":     `http://localhost:${process.env.WAREHOUSE_SERVICE_PORT ?? 3002}`,
  "/api/routing":       `http://localhost:${process.env.ROUTING_SERVICE_PORT ?? 8000}`,
  "/api/notifications": `http://localhost:${process.env.NOTIFICATION_SERVICE_PORT ?? 3003}`,
  "/api/payments":      `http://localhost:${process.env.PAYMENT_SERVICE_PORT ?? 3004}`,
};

for (const [path, target] of Object.entries(routes)) {
  app.use(path, createProxyMiddleware({ target, changeOrigin: true }));
}

if (require.main === module) {
  app.listen(PORT, () => console.log(`API Gateway on port ${PORT}`));
}

export default app;
```

- [ ] **Step 2: Run all api-gateway tests**

```bash
cd services/api-gateway && npx jest --no-coverage
```

Expected:
```
PASS tests/auth.test.ts
  POST /auth/send-otp (3 tests)
  POST /auth/verify-otp (5 tests)
  GET /api/me via requireAuth (2 tests)

Tests: 10 passed, 10 total
```

- [ ] **Step 3: Commit**

```bash
cd ../.. && git add services/api-gateway/src/index.ts
git commit -m "feat: export app from api-gateway, mount /auth and /api/me routes"
```

---

## Task 7: Phase 0 exit criteria smoke test

**Prerequisite:** Copy `.env.example` to `.env` and set `JWT_SECRET`.

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET=dev-secret-local
```

- [ ] **Step 1: Start api-gateway**

```bash
cd services/api-gateway && JWT_SECRET=dev-secret-local npx ts-node-dev --respawn src/index.ts
```

Expected: `API Gateway on port 3000`

- [ ] **Step 2: Verify 401 without token (exit criterion 3)**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/me
```

Expected: `401`

- [ ] **Step 3: Send OTP**

```bash
curl -s -X POST http://localhost:3000/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876500001"}'
```

Expected: `{"message":"OTP sent"}`

The gateway console prints the OTP (Twilio no-ops with placeholder creds):
```
[twilio] no credentials — OTP for +919876500001: Your ThreadDash OTP is 482951...
```

- [ ] **Step 4: Verify OTP returns a JWT (exit criterion 2)**

Replace `482951` with the OTP from the console:

```bash
curl -s -X POST http://localhost:3000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876500001","otp":"482951"}'
```

Expected: JSON with a `token` string and `user.role = "CUSTOMER"`.

- [ ] **Step 5: Hit the protected route with the token**

```bash
TOKEN=<paste-token-from-step-4>
curl -s http://localhost:3000/api/me -H "Authorization: Bearer $TOKEN"
```

Expected: `{"user":{"userId":"...","role":"CUSTOMER","phone":"+919876500001"}}`

- [ ] **Step 6: Verify seeded data in Prisma Studio (exit criterion 1)**

```bash
cd packages/database && npx prisma studio
```

Open `http://localhost:5555` — confirm 10 products and 26 inventory rows with `quantityAvailable = 8`.

- [ ] **Step 7: Final commit and tag**

```bash
cd ../.. && git add -A
git commit -m "chore: Phase 0 Foundation complete — DB migrated, seeded, OTP auth live"
git tag phase-0-complete
```

---

## Phase 0 exit criteria summary

| Exit criterion | Verified in |
|---|---|
| Prisma Studio shows seeded data | Task 3 Steps 7–8 + Task 7 Step 6 |
| `POST /auth/verify-otp` returns a valid JWT | Task 7 Step 4 |
| Protected route returns 401 without token | Task 6 tests (automated) + Task 7 Step 2 |

Phase 1 (Order State Machine) begins after the `phase-0-complete` tag.
