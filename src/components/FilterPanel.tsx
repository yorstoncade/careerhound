"use client";
import { useState } from "react";

/** Filters are always visible on desktop and collapsed behind a toggle on small screens. */
export function FilterPanel({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="btn-ghost w-full justify-between lg:hidden"
      >
        <span>Filters{activeCount > 0 && ` (${activeCount})`}</span>
        <span aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      <div className={`${open ? "mt-3 block" : "hidden"} space-y-4 lg:mt-0 lg:block`}>{children}</div>
    </div>
  );
}
