import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import amqp from "amqplib";
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

app.post("/emit/trial-item-decision", (req, res) => {
  const { orderId, decisions } = req.body as { orderId: string; decisions: { skuId: string; status: string }[] };
  io.to(`order:${orderId}`).emit("trial:item-decision", { orderId, decisions });
  res.json({ ok: true });
});

async function startRabbitMQConsumer() {
  const EXCHANGE = "threaddash";
  const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

  const conn = await amqp.connect(RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange(EXCHANGE, "topic", { durable: true });

  const statusQ = await ch.assertQueue("realtime.order.status_changed", { durable: true });
  await ch.bindQueue(statusQ.queue, EXCHANGE, "order.status_changed");
  ch.consume(statusQ.queue, (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString()) as { orderId: string; to: string; timestamp: string };
      io.to(`order:${payload.orderId}`).emit("order:status", {
        orderId: payload.orderId,
        status: payload.to,
        timestamp: payload.timestamp,
      });
      ch.ack(msg);
    } catch {
      ch.nack(msg, false, false);
    }
  });

  const paymentQ = await ch.assertQueue("realtime.payment", { durable: true });
  await ch.bindQueue(paymentQ.queue, EXCHANGE, "payment.*");
  ch.consume(paymentQ.queue, (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString()) as { orderId: string; status: string };
      io.to(`order:${payload.orderId}`).emit("payment:status", {
        orderId: payload.orderId,
        status: payload.status,
        timestamp: new Date().toISOString(),
      });
      ch.ack(msg);
    } catch {
      ch.nack(msg, false, false);
    }
  });

  const rescheduleQ = await ch.assertQueue("realtime.assignment.rescheduled", { durable: true });
  await ch.bindQueue(rescheduleQ.queue, EXCHANGE, "assignment.rescheduled");
  ch.consume(rescheduleQ.queue, (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString()) as { orderId: string };
      io.to(`order:${payload.orderId}`).emit("order:rescheduled", { orderId: payload.orderId });
      ch.ack(msg);
    } catch { ch.nack(msg, false, false); }
  });

  const absentQ = await ch.assertQueue("realtime.order.absent", { durable: true });
  await ch.bindQueue(absentQ.queue, EXCHANGE, "order.absent_threshold_reached");
  ch.consume(absentQ.queue, (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString()) as { orderId: string };
      io.to(`order:${payload.orderId}`).emit("order:absent", { orderId: payload.orderId });
      ch.ack(msg);
    } catch { ch.nack(msg, false, false); }
  });

  console.log("[realtime] Consuming order.status_changed, payment.*, assignment.rescheduled, order.absent_threshold_reached");
}

httpServer.listen(PORT, () => {
  console.log(`Realtime Service on port ${PORT}`);
  startRabbitMQConsumer().catch((err) => console.error("[realtime] RabbitMQ consumer failed:", err));
});
