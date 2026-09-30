/**
 * Local dev Postgres without installing Postgres: `pnpm db:start`.
 * Runs a portable Postgres (embedded-postgres) with data in .pgdata/ (gitignored),
 * using the user, password, port and database name from DATABASE_URL in apps/api/.env.
 * Ctrl+C stops it; data survives restarts. Delete .pgdata/ to start over.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, "apps/api/.env");
const fromEnv = existsSync(envFile)
  ? readFileSync(envFile, "utf8").match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim()
  : undefined;
const url = new URL(fromEnv || "postgres://postgres:postgres@localhost:5432/sparkytalk");
const database = url.pathname.slice(1) || "sparkytalk";

const dataDir = join(root, ".pgdata");
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: decodeURIComponent(url.username) || "postgres",
  password: decodeURIComponent(url.password) || "postgres",
  port: Number(url.port) || 5432,
  persistent: true,
  onLog: () => {},
});

if (!existsSync(join(dataDir, "PG_VERSION"))) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase(database);
} catch {
  // already exists
}
console.log(`Postgres ready: ${url.protocol}//${url.host}/${database}  (Ctrl+C to stop)`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
