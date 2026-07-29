/**
 * Manually runs the scheduled payments job, the same code Vercel Cron calls
 * daily. A monthly schedule cannot be waited out, so this is how you prove the
 * runner works end to end in development.
 *
 * Run with:
 *   npx tsx --conditions=react-server scripts/run-schedules.ts
 *   npx tsx --conditions=react-server scripts/run-schedules.ts 2026-07-15
 *
 * With no argument it uses the real date, the same as the cron. Pass a date as
 * YYYY-MM-DD to run as if that were today, so a schedule due on that day of the
 * month is picked up. The runner is idempotent for the day, so running it twice
 * for the same date does not pay a schedule twice.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const arg = process.argv[2];
  let now: Date | undefined;

  if (arg) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(arg);
    if (!match) {
      console.error(`Could not read the date "${arg}". Use YYYY-MM-DD, for example 2026-07-15.`);
      process.exit(1);
    }
    now = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 9, 0, 0));
  }

  // Imported lazily so dotenv has populated the environment first.
  const { runScheduledPayments } = await import("../src/lib/cue/schedules");
  const summary = await runScheduledPayments(now);

  console.log(`Ran for day ${summary.day} of the month${now ? ` (simulated ${arg})` : ""}.`);
  console.log(
    `due: ${summary.due}, sent: ${summary.sent}, failed: ${summary.failed}, skipped: ${summary.skipped}`,
  );
  for (const d of summary.details) {
    const extra = d.reason ? ` (${d.reason})` : "";
    console.log(`  ${d.result}: ${d.amount} to ${d.recipient}${extra}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
