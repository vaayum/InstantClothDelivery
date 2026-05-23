import express from "express";
import dotenv from "dotenv";
import inventoryRouter from "./routes/inventory";

dotenv.config();

const app = express();
const PORT = process.env.WAREHOUSE_SERVICE_PORT ?? 3002;
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "warehouse-service" })
);

app.use("/inventory", inventoryRouter);

if (require.main === module) {
  app.listen(PORT, () => console.log(`Warehouse Service on port ${PORT}`));
}

export default app;
