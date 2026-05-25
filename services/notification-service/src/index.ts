import express from "express";
import dotenv from "dotenv";
import { startConsumer } from "./lib/rabbitmq";
import { handleEvent } from "./consumer";

dotenv.config();

const app = express();
const PORT = process.env.NOTIFICATION_SERVICE_PORT ?? 3003;

app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok", service: "notification-service" }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`Notification Service on port ${PORT}`));
  startConsumer(handleEvent).catch((err) => {
    console.error("[notification] Failed to start RabbitMQ consumer:", err);
    process.exit(1);
  });
}

export default app;
