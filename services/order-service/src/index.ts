import express from "express";
import dotenv from "dotenv";
import ordersRouter from "./routes/orders";
import trialRouter from "./routes/trial";
import internalRouter from "./routes/internal";
import { startSlaMonitor } from "./sla-monitor";
import { startTrialTimeoutMonitor } from "./trial-timeout";

dotenv.config();

const app = express();
const PORT = process.env.ORDER_SERVICE_PORT ?? 3001;
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "order-service" })
);

app.use("/", ordersRouter);
app.use("/", trialRouter);
app.use("/internal", internalRouter);

if (require.main === module) {
  startSlaMonitor();
  startTrialTimeoutMonitor();
  app.listen(PORT, () => console.log(`Order Service on port ${PORT}`));
}

export default app;
