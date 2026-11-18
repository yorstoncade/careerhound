"use client";
import { useState } from "react";

export function AlertForm({ query, summary }: { query: string; summary: string }) {
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, frequency, query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  }

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold">Get these jobs by email</h2>
      <p className="mt-1 text-xs text-zinc-500">New matches for <span className="font-medium">{summary}</span>.</p>
      {state === "sent" ? (
        <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          Check your inbox to confirm your alert.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <input
            type="email"
            required
            className="input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email address"
          />
          <div className="flex gap-2">
            <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)} aria-label="Frequency">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <button className="btn shrink-0" disabled={state === "sending"}>
              {state === "sending" ? "…" : "Create alert"}
            </button>
          </div>
          {state === "error" && <p className="text-xs text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}
