import express from "express";
import dotenv from "dotenv";
import ordersRouter from "./routes/orders";

dotenv.config();

const app = express();
const PORT = process.env.ORDER_SERVICE_PORT ?? 3001;
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "order-service" })
);

app.use("/", ordersRouter);

if (require.main === module) {
  app.listen(PORT, () => console.log(`Order Service on port ${PORT}`));
}

export default app;
