import type { Http } from "../http";

interface Rule {
  allow: boolean;
  path: string;
}
interface Group {
  agents: string[];
  rules: Rule[];
}

export function parseRobots(txt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!current) continue;
      if ((key === "disallow" || key === "allow") && value) current.rules.push({ allow: key === "allow", path: value });
    }
  }
  return groups;
}

function ruleMatches(rulePath: string, path: string) {
  const re = new RegExp(
    "^" + rulePath.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$|\$$/, "$"),
  );
  return re.test(path);
}

/** Longest matching rule wins; Allow wins ties. Uses our own group if present, else `*`. */
export function isAllowed(groups: Group[], pathWithQuery: string, agent = "jobscout"): boolean {
  const ours = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const applicable = ours.length ? ours : groups.filter((g) => g.agents.includes("*"));
  let best: Rule | null = null;
  for (const g of applicable) {
    for (const r of g.rules) {
      if (!ruleMatches(r.path, pathWithQuery)) continue;
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
  }
  return best ? best.allow : true;
}

/** Fetches and caches robots.txt per origin. A missing or unreadable file allows everything. */
export function createRobots(http: Http) {
  const cache = new Map<string, Promise<Group[]>>();
  return async (url: string): Promise<boolean> => {
    const u = new URL(url);
    if (!cache.has(u.origin)) {
      cache.set(u.origin, http.text(`${u.origin}/robots.txt`).then(parseRobots, () => []));
    }
    return isAllowed(await cache.get(u.origin)!, u.pathname + u.search);
  };
}
