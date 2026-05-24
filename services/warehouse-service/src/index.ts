import express from "express";
import dotenv from "dotenv";
import inventoryRouter from "./routes/inventory";
import pickingRouter from "./routes/picking";
import returnsRouter from "./routes/returns";
import { startConsumer } from "./consumer";

dotenv.config();

const app = express();
const PORT = process.env.WAREHOUSE_SERVICE_PORT ?? 3002;
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "warehouse-service" })
);

app.use("/inventory", inventoryRouter);
app.use("/picking-queue", pickingRouter);
app.use("/returns", returnsRouter);

if (require.main === module) {
  startConsumer().catch(console.error);
  app.listen(PORT, () => console.log(`Warehouse Service on port ${PORT}`));
}

export default app;
