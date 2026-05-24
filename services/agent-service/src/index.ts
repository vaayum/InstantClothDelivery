import express from "express";
import dotenv from "dotenv";
import assignmentsRouter from "./routes/assignments";
import agentsRouter from "./routes/agents";
import { startConsumer } from "./consumer";

dotenv.config();

const app = express();
const PORT = process.env.AGENT_SERVICE_PORT ?? 3006;
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "agent-service" })
);

app.use("/assignments", assignmentsRouter);
app.use("/agents", agentsRouter);

if (require.main === module) {
  startConsumer().catch(console.error);
  app.listen(PORT, () => console.log(`Agent Service on port ${PORT}`));
}

export default app;
