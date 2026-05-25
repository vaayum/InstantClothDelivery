import express from "express";
import dotenv from "dotenv";
import paymentsRouter from "./routes/payments";

dotenv.config();

const app = express();
const PORT = process.env.PAYMENT_SERVICE_PORT ?? 3004;
// Webhook must receive raw bytes for HMAC verification — register before express.json()
app.use("/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "payment-service" })
);

app.use("/payments", paymentsRouter);

if (require.main === module) {
  app.listen(PORT, () => console.log(`Payment Service on port ${PORT}`));
}

export default app;
