import { zValidator } from "@hono/zod-validator";
import { Role } from "@sparkytalk/shared";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client";
import { employees } from "../db/schema";
import { requireManager, type AppEnv } from "../lib/auth";

const CreateEmployeeInput = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  role: Role,
  phone: z.string().nullable().default(null),
});

export const employeeRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const rows = await db
      .select({
        id: employees.id,
        name: employees.name,
        aliases: employees.aliases,
        role: employees.role,
        phone: employees.phone,
      })
      .from(employees)
      .where(eq(employees.companyId, c.get("user").companyId))
      .orderBy(asc(employees.name));
    return c.json(rows);
  })
  .post("/", requireManager, zValidator("json", CreateEmployeeInput), async (c) => {
    const input = c.req.valid("json");
    if (input.role === "owner" && c.get("user").role !== "owner") {
      return c.json({ error: "only owners can add owners" }, 403);
    }
    const [row] = await db
      .insert(employees)
      .values({ ...input, companyId: c.get("user").companyId })
      .returning();
    return c.json(row, 201);
  });
