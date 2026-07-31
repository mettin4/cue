/**
 * Applies the SQL migrations in supabase/migrations to the database pointed at
 * by SUPABASE_DB_URL, then prints the resulting public tables.
 *
 * Run with:
 *   npx tsx scripts/apply-migration.ts
 *
 * The migration is written to be idempotent, so re-running it is safe.
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const EXPECTED_TABLES = [
  "connect_tokens",
  "contacts",
  "debts",
  "email_logs",
  "requests",
  "scheduled_payments",
  "transactions",
  "used_confirmations",
  "users",
];

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error(
      "SUPABASE_DB_URL is empty. Paste the Supabase connection string into .env.local first.",
    );
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    // Supabase terminates TLS with a certificate this client does not have in
    // its trust store, so verification is disabled for this admin script.
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
  } catch (error) {
    console.error("Could not connect to the database.");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  try {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`Applying ${file} ...`);
      await client.query(sql);
      console.log(`  applied ${file}`);
    }

    const { rows } = await client.query<{
      table_name: string;
      rls: boolean;
    }>(
      `select c.relname as table_name, c.relrowsecurity as rls
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname`,
    );

    console.log("");
    console.log("Tables in public schema:");
    for (const row of rows) {
      console.log(`  ${row.table_name}  (RLS enabled: ${row.rls})`);
    }

    const found = rows.map((row) => row.table_name);
    const missing = EXPECTED_TABLES.filter((name) => !found.includes(name));

    console.log("");
    if (missing.length > 0) {
      console.error(`Missing expected tables: ${missing.join(", ")}`);
      process.exit(1);
    }
    console.log(`Migration OK, all ${EXPECTED_TABLES.length} expected tables exist.`);
  } catch (error) {
    console.error("Migration FAILED");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
