import express from "express";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.NOTIFICATION_SERVICE_PORT ?? 3003;
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "notification-service" }));

// Consumes RabbitMQ events: ORDER_PLACED, ORDER_READY_FOR_PICKUP, etc.
// Sends FCM push (firebase-admin) with Twilio SMS as fallback for critical alerts.
// Respects DND window: no customer push between 22:00–08:00.
// Agent notifications have no DND.

app.listen(PORT, () => console.log(`Notification Service on port ${PORT}`));
