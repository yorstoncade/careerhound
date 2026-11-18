#!/usr/bin/env node
/**
 * One-time setup, safe to re-run: every step skips itself when it's already done.
 * Plain Node with no dependencies, so it can run before `npm install`.
 *
 *   npm run setup
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIN_NODE = [18, 18];

const at = (...p) => path.join(ROOT, ...p);
const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : 0);

export class SetupError extends Error {}

export function step(n, total, msg) {
  console.log(`\n\x1b[1m[${n}/${total}] ${msg}\x1b[0m`);
}

/**
 * Run a command. Throws SetupError with `hint` if it fails.
 * With `quiet`, output is hidden unless the command fails, so routine steps stay readable.
 */
export function run(cmd, args, hint, { quiet = false, ...opts } = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: quiet ? "pipe" : "inherit",
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
  if (r.error || r.status !== 0) {
    if (quiet) process.stderr.write(`${r.stdout ?? ""}${r.stderr ?? ""}`);
    throw new SetupError(`${hint}\n(command: ${cmd} ${args.join(" ")} — ${r.error?.message ?? `exit code ${r.status}`})`);
  }
}

/** Run a CLI that ships inside node_modules with the current Node binary (no shell, works on Windows). */
export function runBin(relPath, args, hint, opts) {
  run(process.execPath, [at("node_modules", relPath), ...args], hint, opts);
}

export function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
    throw new SetupError(
      `JobScout needs Node.js ${MIN_NODE.join(".")} or newer, but you have ${process.versions.node}.\n` +
        "Download the LTS version from https://nodejs.org, install it, and try again.",
    );
  }
}

export function setup() {
  const total = 5;
  checkNode();

  step(1, total, "Installing dependencies");
  const lock = at("package-lock.json");
  const installed = at("node_modules", ".package-lock.json");
  if (existsSync(installed) && mtime(installed) >= mtime(lock)) {
    console.log("Already installed.");
  } else {
    console.log("First run only. This downloads a few hundred MB and can take a minute or two…");
    // npm is a .cmd script on Windows, so it needs a shell there.
    run("npm", ["install", "--no-audit", "--no-fund"], "Installing dependencies failed. Check your internet connection and try again.", {
      shell: process.platform === "win32",
    });
  }

  step(2, total, "Creating settings file (.env)");
  if (existsSync(at(".env"))) {
    console.log("Already exists.");
  } else {
    copyFileSync(at(".env.example"), at(".env"));
    console.log("Created .env from .env.example.");
  }

  step(3, total, "Preparing the database");
  runBin("prisma/build/index.js", ["migrate", "deploy"], "Setting up the database failed.", { quiet: true });
  console.log("Database is up to date.");

  step(4, total, "Generating the database client");
  runBin("prisma/build/index.js", ["generate"], "Generating the database client failed.", { quiet: true });
  console.log("Done.");

  step(5, total, "Loading the company list");
  runBin("tsx/dist/cli.mjs", ["prisma/seed.ts"], "Loading the company list failed.", { quiet: true });
  console.log("Done.");
}

function isMain() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  try {
    setup();
    console.log(
      "\n\x1b[32mSetup complete.\x1b[0m Start JobScout with `npm run launch`, or double-click start.command (Mac) / start.bat (Windows).",
    );
  } catch (e) {
    console.error(`\n\x1b[31m${e instanceof SetupError ? e.message : e?.stack ?? e}\x1b[0m`);
    process.exit(1);
  }
}
