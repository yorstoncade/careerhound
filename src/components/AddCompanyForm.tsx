"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Result {
  existed: boolean;
  company: { name: string; slug: string };
  found: number;
  via: string;
  method: string;
  sample: string[];
}

const METHOD_LABEL: Record<string, string> = {
  "json-ld": "from its job listings data",
  html: "by reading its job pages",
  rendered: "by loading it in a browser",
};

export function AddCompanyForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("working");
    setResult(null);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setResult(data);
      setState("done");
      setUrl("");
      setName("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  }

  const how = result && (result.method === "platform" ? `via ${result.via}` : METHOD_LABEL[result.method] ?? "");

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold">Add a company</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Paste any careers page link. JobScout detects Greenhouse, Lever, Ashby, Workable, SmartRecruiters and Workday,
        and can read most other careers sites too.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          inputMode="url"
          required
          className="input sm:flex-[2]"
          placeholder="https://company.com/careers"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Careers page URL"
          disabled={state === "working"}
        />
        <input
          className="input sm:flex-1"
          placeholder="Company name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Company name"
          disabled={state === "working"}
        />
        <button className="btn shrink-0" disabled={state === "working"}>
          {state === "working" ? "Checking…" : "Add company"}
        </button>
      </form>
      {state === "working" && (
        <p className="mt-3 text-sm text-zinc-500">Checking the careers page. This can take up to a minute…</p>
      )}
      {state === "error" && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">{error}</p>
      )}
      {state === "done" && result && (
        <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
          <p>
            {result.existed ? "Already tracking " : "Added "}
            <b>{result.company.name}</b>: {result.found} open {result.found === 1 ? "job" : "jobs"} {how}.{" "}
            <Link href={`/?company=${result.company.slug}`} className="font-medium underline">
              See jobs
            </Link>
          </p>
          {result.sample.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs opacity-80">
              {result.sample.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
