import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import type { RenderFn } from "../ats/types";

type Browser = import("playwright").Browser;

let installAttempted = false;

function installChromium() {
  if (installAttempted) return false;
  installAttempted = true;
  console.log(
    "\nThis careers page needs a web browser to load its jobs. Downloading one for JobScout " +
      "(one time only, about 150 MB)…",
  );
  const require = createRequire(import.meta.url);
  const cli = path.join(path.dirname(require.resolve("playwright/package.json")), "cli.js");
  const r = spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" });
  return r.status === 0;
}

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright");
  const opts = { headless: true, executablePath: process.env.CHROMIUM_PATH || undefined };
  try {
    return await chromium.launch(opts);
  } catch (e) {
    if (/Executable doesn't exist|install/i.test((e as Error).message) && !opts.executablePath && installChromium()) {
      return chromium.launch(opts);
    }
    throw new Error(`Couldn't start the headless browser: ${(e as Error).message.split("\n")[0]}`);
  }
}

/**
 * A renderer that starts Chromium on first use and reuses it. Call `close()` when done.
 * Pages render without images, fonts or media, and we wait for the network to go quiet.
 */
export function createRenderer(): { render: RenderFn; close: () => Promise<void> } {
  let browser: Promise<Browser> | null = null;
  return {
    async render(url) {
      browser ??= launch();
      const b = await browser;
      const context = await b.newContext({ userAgent: "Mozilla/5.0 (compatible; JobScout/0.1; job aggregator)" });
      try {
        const page = await context.newPage();
        await page.route("**/*", (route) =>
          ["image", "font", "media"].includes(route.request().resourceType()) ? route.abort() : route.continue(),
        );
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        return await page.content();
      } finally {
        await context.close();
      }
    },
    async close() {
      if (browser) await (await browser.catch(() => null))?.close();
      browser = null;
    },
  };
}
