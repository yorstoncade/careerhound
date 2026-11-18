/** Email each confirmed, due alert its digest of new matching jobs. Run after `npm run scrape`. */
import { PrismaClient } from "@prisma/client";
import { sendDueAlerts } from "../src/lib/alerts";

async function main() {
  const db = new PrismaClient();
  const results = await sendDueAlerts(db);
  for (const r of results) console.log(`  ${r.email.padEnd(32)} ${r.skipped ?? `sent ${r.sent} jobs`}`);
  console.log(`\n${results.filter((r) => r.sent).length} digest(s) sent, ${results.length} confirmed alert(s).`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
