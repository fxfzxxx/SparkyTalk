import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requireUser, type AppEnv } from "./lib/auth";
import { aiRoutes } from "./routes/ai";
import { employeeRoutes } from "./routes/employees";
import { scheduleRoutes } from "./routes/schedule";
import { siteRoutes } from "./routes/sites";
import { visitRoutes } from "./routes/visits";

const origins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export const app = new Hono<AppEnv>()
  .use(logger())
  .use(cors({ origin: origins, allowHeaders: ["content-type", "authorization", "x-dev-user-id"] }))
  .get("/health", (c) => c.json({ ok: true }))
  .use("/v1/*", requireUser)
  .get("/v1/me", (c) => c.json(c.get("user")))
  .route("/v1/employees", employeeRoutes)
  .route("/v1/sites", siteRoutes)
  .route("/v1/schedule", scheduleRoutes)
  .route("/v1/visits", visitRoutes)
  .route("/v1/ai", aiRoutes);

export type AppType = typeof app;
