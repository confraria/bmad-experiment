// Idempotent startup migration for Docker runtime.
// Mirrors prisma/migrations/20260422183933_init/migration.sql but uses
// "IF NOT EXISTS" so it's safe to run on every container start.
// Uses @libsql/client directly — avoids shipping the Prisma CLI (~600MB).
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('migrate.mjs: DATABASE_URL (or TURSO_DATABASE_URL) is required');
  process.exit(1);
}

const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient({ url, authToken });

const statements = [
  `CREATE TABLE IF NOT EXISTS "Todo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,
    "deletedAt" BIGINT
  )`,
  `CREATE INDEX IF NOT EXISTS "Todo_clientId_idx" ON "Todo"("clientId")`,
  `CREATE INDEX IF NOT EXISTS "Todo_updatedAt_idx" ON "Todo"("updatedAt")`,
];

try {
  for (const sql of statements) {
    await client.execute(sql);
  }
  console.log('migrate.mjs: schema applied');
} catch (err) {
  console.error('migrate.mjs: failed', err);
  process.exit(1);
} finally {
  client.close();
}
