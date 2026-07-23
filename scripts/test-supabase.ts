/**
 * Supabase connection test.
 *
 * Run with:
 *   npx tsx --conditions=react-server scripts/test-supabase.ts
 *
 * The react-server condition is required because the client modules are marked
 * "server-only", which throws under any other resolution condition.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import { getSupabaseAdmin } from "../src/lib/supabase/server";

async function main() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("users")
    .select("id, email, created_at")
    .limit(1);

  if (error) {
    console.error("Supabase FAILED");
    console.error(`  message: ${error.message}`);
    if (error.code) console.error(`  code: ${error.code}`);
    if (error.details) console.error(`  details: ${error.details}`);
    if (error.hint) console.error(`  hint: ${error.hint}`);
    process.exit(1);
  }

  console.log("Supabase OK");
  console.log(`  service role select on users returned ${data?.length ?? 0} row(s)`);
}

main().catch((error) => {
  console.error("Supabase FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
