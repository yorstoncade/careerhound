"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const DEFAULTS: Record<string, string> = { sort: "newest" };

/**
 * Enhances the enclosing GET form: submits when one of its selects or checkboxes changes, and
 * navigates to a clean URL without empty or default params. Listens on the document because
 * fields attached with the `form="…"` attribute sit outside the form element.
 */
export function AutoSubmit() {
  const ref = useRef<HTMLSpanElement>(null);
  const router = useRouter();
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const t = e.target;
      const isSelect = t instanceof HTMLSelectElement;
      const isCheckbox = t instanceof HTMLInputElement && t.type === "checkbox";
      if ((isSelect || isCheckbox) && t.form === form) form.requestSubmit();
    };
    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault();
      const sp = new URLSearchParams();
      for (const [k, v] of new FormData(form)) {
        const s = String(v).trim();
        if (s && DEFAULTS[k] !== s) sp.set(k, s);
      }
      const qs = sp.toString();
      router.push(qs ? `${form.getAttribute("action") ?? ""}?${qs}` : (form.getAttribute("action") ?? "/"));
    };
    document.addEventListener("change", onChange);
    form.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("change", onChange);
      form.removeEventListener("submit", onSubmit);
    };
  }, [router]);
  return <span ref={ref} hidden />;
}
