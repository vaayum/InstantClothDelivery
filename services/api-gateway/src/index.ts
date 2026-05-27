import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import dotenv from "dotenv";
import { requireAuth } from "@threaddash/auth";
import authRouter from "./routes/auth";
import addressesRouter from "./routes/addresses";
import usersRouter from "./routes/users";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.API_GATEWAY_PORT ?? 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

app.use("/auth", authRouter);
app.use("/api/addresses", addressesRouter);
app.use("/api/users", usersRouter);

// inject pinnedWarehouseId into catalog proxy requests
app.use("/api/catalog", requireAuth, async (req: any, _res: any, next: any) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { pinnedWarehouseId: true },
  });
  if (user?.pinnedWarehouseId) {
    const sep = req.url.includes("?") ? "&" : "?";
    req.url += `${sep}warehouseId=${encodeURIComponent(user.pinnedWarehouseId)}`;
  }
  next();
});

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "api-gateway", ts: new Date().toISOString() })
);

app.get("/api/me", requireAuth, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { pinnedWarehouseId: true },
  });
  res.json({ user: { ...req.user, pinnedWarehouseId: user?.pinnedWarehouseId ?? null } });
});

const routes: Record<string, string> = {
  "/api/admin":         `http://localhost:${process.env.ORDER_SERVICE_PORT ?? 3001}`,
  "/api/orders":        `http://localhost:${process.env.ORDER_SERVICE_PORT ?? 3001}`,
  "/api/catalog":       `http://localhost:${process.env.ORDER_SERVICE_PORT ?? 3001}`,
  "/api/warehouse":     `http://localhost:${process.env.WAREHOUSE_SERVICE_PORT ?? 3002}`,
  "/api/routing":       `http://localhost:${process.env.ROUTING_SERVICE_PORT ?? 8000}`,
  "/api/notifications": `http://localhost:${process.env.NOTIFICATION_SERVICE_PORT ?? 3003}`,
  "/api/payments":      `http://localhost:${process.env.PAYMENT_SERVICE_PORT ?? 3004}`,
  "/api/agents":        `http://localhost:${process.env.AGENT_SERVICE_PORT ?? 3006}`,
};

function restream(proxyReq: any, req: any) {
  if (req.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
    const body = JSON.stringify(req.body);
    proxyReq.setHeader("Content-Type", "application/json");
    proxyReq.setHeader("Content-Length", Buffer.byteLength(body));
    proxyReq.write(body);
    proxyReq.end();
  }
}

for (const [path, target] of Object.entries(routes)) {
  app.use(createProxyMiddleware({
    pathFilter: path,
    target,
    changeOrigin: true,
    on: { proxyReq: restream },
  }));
}

if (require.main === module) {
  app.listen(PORT, () => console.log(`API Gateway on port ${PORT}`));
}

export default app;
