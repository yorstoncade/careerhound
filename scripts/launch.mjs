#!/usr/bin/env node
/**
 * Everything the double-click launchers do: set up (first run), fetch fresh jobs, build the site
 * if needed, start it, and open it in the browser.
 *
 *   npm run launch                 # JOBSCOUT_NO_OPEN=1 skips opening the browser
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { ROOT, SetupError, runBin, setup, step } from "./setup.mjs";

const at = (...p) => path.join(ROOT, ...p);

/** Newest modification time among files that affect the built site. */
function newestSource() {
  let newest = 0;
  const visit = (p) => {
    if (!existsSync(p)) return;
    const s = statSync(p);
    if (s.isDirectory()) for (const f of readdirSync(p)) visit(path.join(p, f));
    else newest = Math.max(newest, s.mtimeMs);
  };
  for (const p of ["src", "prisma/schema.prisma", "package.json", "next.config.ts", "postcss.config.mjs"]) visit(at(p));
  return newest;
}

function needsBuild() {
  const id = at(".next", "BUILD_ID");
  return !existsSync(id) || statSync(id).mtimeMs < newestSource();
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, () => srv.close(() => resolve(true)));
  });
}

async function findPort(start = 3000) {
  for (let p = start; p < start + 50; p++) if (await isPortFree(p)) return p;
  throw new SetupError(`No free port found between ${start} and ${start + 49}.`);
}

async function waitForServer(url, child, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new SetupError("The website stopped while starting (see the messages above).");
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new SetupError(`The website didn't start within ${timeoutMs / 1000} seconds.`);
}

function openBrowser(url) {
  if (process.env.JOBSCOUT_NO_OPEN) return;
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.on("error", () => console.log(`Open ${url} in your browser.`));
  child.unref();
}

async function main() {
  setup();

  const total = 3;
  step(1, total, "Fetching the latest jobs");
  try {
    runBin("tsx/dist/cli.mjs", ["scripts/scrape.ts", "--demo-if-empty"], "Fetching jobs failed.");
  } catch (e) {
    // Not fatal: the site can still show whatever jobs we fetched last time.
    console.log(`\x1b[33m${e.message}\nStarting with the jobs from last time.\x1b[0m`);
  }

  step(2, total, "Building the website");
  if (needsBuild()) {
    console.log("First run (or after an update) only. This takes about a minute…");
    runBin("next/dist/bin/next", ["build"], "Building the website failed.", { quiet: true });
    console.log("Done.");
  } else {
    console.log("Already built.");
  }

  step(3, total, "Starting JobScout");
  const port = await findPort(Number(process.env.PORT) || 3000);
  const url = `http://localhost:${port}`;
  const server = spawn(process.execPath, [at("node_modules/next/dist/bin/next"), "start", "-p", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, APP_URL: process.env.APP_URL || url },
  });
  const stop = () => server.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("SIGHUP", stop); // closing the Terminal window on macOS
  server.on("exit", (code) => process.exit(code ?? 0));

  await waitForServer(url, server);
  openBrowser(url);
  console.log(
    `\n\x1b[32m\x1b[1mJobScout is running at ${url}\x1b[0m\n` +
      "Keep this window open while you use it. To stop JobScout, close this window or press Ctrl+C.",
  );
}

main().catch((e) => {
  console.error(`\n\x1b[31m${e instanceof SetupError ? e.message : e?.stack ?? e}\x1b[0m`);
  process.exit(1);
});
