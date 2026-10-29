/**
 * Project-local PostgreSQL for development (no Docker / system install required).
 * Data lives in <repo>/.pgdata (gitignored). Not for production.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dataDir = path.join(root, ".pgdata");
const port = Number(process.env.DEV_DB_PORT ?? 54329);
const user = "tanvi";
const password = "tanvi_dev_only";

const pg = new EmbeddedPostgres({ databaseDir: dataDir, user, password, port, persistent: true });

if (!existsSync(path.join(dataDir, "PG_VERSION"))) await pg.initialise();
await pg.start();
for (const db of ["tanvi", "tanvi_test"]) {
  try {
    await pg.createDatabase(db);
  } catch {
    /* already exists */
  }
}
console.log(`Dev PostgreSQL ready on port ${port}. Databases: tanvi, tanvi_test. Ctrl+C to stop.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
