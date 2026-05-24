import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import type { AgentLocationUpdate, OrderStatusUpdate, TrialTimerUpdate } from "@threaddash/shared-types";

dotenv.config();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
const PORT = process.env.REALTIME_SERVICE_PORT ?? 3005;

app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok", service: "realtime-service" }));

io.on("connection", (socket) => {
  socket.on("subscribe:order", (orderId: string) => socket.join(`order:${orderId}`));
  socket.on("agent:location", (data: AgentLocationUpdate) =>
    io.to(`order:${data.orderId}`).emit("agent:location", data)
  );
});

app.post("/emit/agent-location", (req, res) => {
  const data = req.body as AgentLocationUpdate;
  io.to(`order:${data.orderId}`).emit("agent:location", data);
  res.json({ ok: true });
});

app.post("/emit/order-status", (req, res) => {
  const data = req.body as OrderStatusUpdate;
  io.to(`order:${data.orderId}`).emit("order:status", data);
  res.json({ ok: true });
});

app.post("/emit/trial-timer", (req, res) => {
  const data = req.body as TrialTimerUpdate;
  io.to(`order:${data.orderId}`).emit("trial:timer", data);
  res.json({ ok: true });
});

httpServer.listen(PORT, () => console.log(`Realtime Service on port ${PORT}`));
