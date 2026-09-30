import type { Role } from "@sparkytalk/shared";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db } from "../db/client";
import { employees } from "../db/schema";

export interface AuthUser {
  id: string;
  companyId: string;
  name: string;
  role: Role;
}

export type AppEnv = { Variables: { user: AuthUser } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertAuthConfig() {
  if (process.env.AUTH_MODE === "dev" && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_MODE=dev must not be used in production");
  }
}

/**
 * TODO(auth): replace with a real provider (see CLAUDE.md, Auth 待定).
 * Until then only AUTH_MODE=dev is supported: the caller names an employee by
 * username (e.g. "admin") or id in the x-dev-user-id header.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (process.env.AUTH_MODE !== "dev") {
    return c.json({ error: "auth_not_configured" }, 501);
  }
  const login = c.req.header("x-dev-user-id")?.trim();
  if (!login) return c.json({ error: "unauthenticated" }, 401);
  const match = UUID_RE.test(login)
    ? eq(employees.id, login)
    : eq(employees.username, login.toLowerCase());
  const [row] = await db.select().from(employees).where(match).limit(1);
  if (!row) return c.json({ error: "unauthenticated" }, 401);
  c.set("user", { id: row.id, companyId: row.companyId, name: row.name, role: row.role });
  await next();
});

export function isManager(user: AuthUser): boolean {
  return user.role === "owner" || user.role === "admin";
}

export const requireManager = createMiddleware<AppEnv>(async (c, next) => {
  if (!isManager(c.get("user"))) return c.json({ error: "forbidden" }, 403);
  await next();
});
