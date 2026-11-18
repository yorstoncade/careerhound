/** Serve the fixture careers sites for manual testing: npx tsx tests/fixtures/careers/serve.ts [port] */
import { removed, startFixtureSite } from "./site";

// REMOVE=/acme/jobs/102 simulates a job being taken down.
for (const p of process.env.REMOVE?.split(",") ?? []) if (p) removed.add(p);

startFixtureSite(Number(process.argv[2]) || 4400).then(({ base }) => {
  console.log(`Fixture careers sites at ${base}/acme/careers, /beta/careers, /gamma/careers, /delta/careers`);
});
