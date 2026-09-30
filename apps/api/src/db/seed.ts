/**
 * Dev seed: one company, an owner, two electricians and a two-level site.
 * Usage: pnpm --filter @sparkytalk/api db:seed
 */
import { db } from "./client";
import { companies, employees } from "./schema";
import { createSite } from "../lib/sites";

const [company] = await db.insert(companies).values({ name: "Demo Electrical Ltd" }).returning();
if (!company) throw new Error("seed failed");

const staff = await db
  .insert(employees)
  .values([
    { companyId: company.id, name: "Aaron Li", username: "admin", aliases: ["老板", "Aaron"], role: "owner" },
    { companyId: company.id, name: "张伟", username: "worker1", aliases: ["小张", "Zhang", "David"], role: "worker" },
    { companyId: company.id, name: "Mike Brown", username: "worker2", aliases: ["Mike"], role: "worker" },
  ])
  .returning();

await db.transaction(async (tx) => {
  await createSite(tx, company.id, {
    displayName: "151 Coast Rd",
    officialAddress: "151 Coast Road, Wainuiomata, Lower Hutt",
    legalDescription: null,
    aliases: [],
    floorAreaM2: 186,
    levels: [
      { name: "Ground", rooms: ["Garage", "Kitchen", "Lounge", "Laundry", "Bed 3"] },
      { name: "First", rooms: ["Master Suite", "Ensuite", "Bed 2", "Bathroom"] },
    ],
  });
  await createSite(tx, company.id, {
    displayName: "Lot 23, Stage 2 Kāpiti Views",
    officialAddress: null,
    legalDescription: "Lot 23 DP 512345",
    aliases: ["老王那个新房"],
    floorAreaM2: null,
    levels: [],
  });
});

console.log("Seeded company", company.id);
for (const e of staff) console.log(`  ${e.role.padEnd(6)} ${e.name}  用户名: ${e.username}`);
process.exit(0);
