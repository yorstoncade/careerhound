import { lookup } from "node:dns/promises";
import net from "node:net";
import pLimit, { type LimitFunction } from "p-limit";

export const USER_AGENT = "JobScout/0.1 (job aggregator; +https://github.com/)";
const MAX_BYTES = 5 * 1024 * 1024;
const PER_HOST_CONCURRENCY = 2;

export interface Http {
  json(url: string, init?: { method?: string; body?: unknown }): Promise<unknown>;
  text(url: string): Promise<string>;
}

export class HttpError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** Reject URLs that aren't http(s) or that point at private, loopback or link-local addresses. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError("That doesn't look like a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new HttpError("Only http(s) URLs are supported");
  if (process.env.ALLOW_PRIVATE_URLS === "1") return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) throw new HttpError(`Couldn't find the website ${url.hostname}`);
  if (addrs.some(isPrivateAddress)) throw new HttpError("That URL points to a private network address");
  return url;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new HttpError("Response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** HTTP client with retries, timeouts, a size cap and per-host concurrency limits. */
export function createHttp(opts: { timeoutMs?: number; retries?: number } = {}): Http {
  const limits = new Map<string, LimitFunction>();
  const limitFor = (url: string) => {
    const host = new URL(url).host;
    if (!limits.has(host)) limits.set(host, pLimit(PER_HOST_CONCURRENCY));
    return limits.get(host)!;
  };

  async function request(url: string, accept: string, init?: { method?: string; body?: unknown }): Promise<string> {
    let lastErr: unknown;
    const attempts = (opts.retries ?? 2) + 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const res = await fetch(url, {
          method: init?.method ?? "GET",
          headers: {
            Accept: accept,
            "User-Agent": USER_AGENT,
            ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
          redirect: "follow",
        });
        if (res.status === 404) throw Object.assign(new HttpError("not found (404)", 404), { fatal: true });
        if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status);
        return await readCapped(res);
      } catch (e) {
        const cause = (e as { cause?: { code?: string; message?: string } }).cause;
        lastErr = cause ? new HttpError(`${(e as Error).message}: ${cause.code ?? cause.message}`) : e;
        // These won't fix themselves on retry (offline, blocked/misspelled host, missing page).
        if (cause?.code && ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"].includes(cause.code)) break;
        if ((e as { fatal?: boolean }).fatal || (e as Error).message === "Response too large") break;
        if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    throw lastErr;
  }

  return {
    json: (url, init) =>
      limitFor(url)(async () => {
        const body = await request(url, "application/json", init);
        try {
          return JSON.parse(body);
        } catch {
          throw new HttpError("Expected JSON but got something else");
        }
      }),
    text: (url) => limitFor(url)(() => request(url, "text/html,application/xhtml+xml,*/*;q=0.8")),
  };
}
