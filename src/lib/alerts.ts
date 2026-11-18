import type { Alert, PrismaClient } from "@prisma/client";
import { appUrl, escapeHtml, formatSalary } from "./format";
import { sendMail } from "./mailer";
import { buildOrderBy, buildWhere, describeFilters, filtersToQuery, parseFilters, type JobFilters } from "./search";

export const DIGEST_LIMIT = 25;
const FREQ_MS: Record<string, number> = { daily: 864e5, weekly: 7 * 864e5 };

/** Alerts store their filters as the same query string the feed URL uses. */
export function alertFilters(alert: Pick<Alert, "query">): JobFilters {
  return parseFilters(new URLSearchParams(alert.query));
}

function layout(body: string, unsubUrl?: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
<div style="max-width:600px;margin:0 auto;padding:24px">
<div style="font-weight:700;font-size:18px;margin-bottom:16px">JobScout</div>
<div style="background:#fff;border-radius:12px;padding:24px">${body}</div>
${unsubUrl ? `<p style="font-size:12px;color:#71717a;margin-top:16px">You're receiving this because you subscribed to a JobScout alert. <a href="${unsubUrl}" style="color:#71717a">Unsubscribe</a></p>` : ""}
</div></body></html>`;
}

export async function sendConfirmation(alert: Alert) {
  const url = appUrl(`/alerts/confirm?token=${alert.confirmToken}`);
  const what = describeFilters(alertFilters(alert));
  return sendMail({
    to: alert.email,
    subject: "Confirm your JobScout job alert",
    text: `Confirm your ${alert.frequency} alert for ${what}:\n${url}\n\nIf you didn't request this, ignore this email.`,
    html: layout(`<h1 style="font-size:20px;margin:0 0 12px">Confirm your job alert</h1>
<p>You asked for a <b>${alert.frequency}</b> email of new jobs matching <b>${escapeHtml(what)}</b>.</p>
<p><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Confirm alert</a></p>
<p style="font-size:13px;color:#71717a">If you didn't request this, ignore this email.</p>`),
  });
}

export interface DigestResult {
  email: string;
  sent: number;
  skipped?: string;
}

/** Send one digest per confirmed, due alert, covering jobs first seen since its last send. */
export async function sendDueAlerts(db: PrismaClient, now = new Date()): Promise<DigestResult[]> {
  const alerts = await db.alert.findMany({ where: { confirmed: true } });
  const results: DigestResult[] = [];
  for (const alert of alerts) {
    const period = FREQ_MS[alert.frequency] ?? FREQ_MS.daily;
    // Allow an hour of slack so a daily cron that drifts slightly doesn't skip a day.
    if (alert.lastSentAt && now.getTime() - alert.lastSentAt.getTime() < period - 36e5) {
      results.push({ email: alert.email, sent: 0, skipped: "not due" });
      continue;
    }
    const filters = alertFilters(alert);
    const since = alert.lastSentAt ?? alert.createdAt;
    const where = buildWhere(filters, { newSince: since, now });
    const [total, jobs] = await Promise.all([
      db.job.count({ where }),
      db.job.findMany({ where, orderBy: buildOrderBy(filters), take: DIGEST_LIMIT, include: { company: true } }),
    ]);
    if (total === 0) {
      results.push({ email: alert.email, sent: 0, skipped: "no new matches" });
      await db.alert.update({ where: { id: alert.id }, data: { lastSentAt: now } });
      continue;
    }
    const what = describeFilters(filters);
    const unsub = appUrl(`/alerts/unsubscribe?token=${alert.unsubToken}`);
    const seeAll = appUrl(`/?${filtersToQuery({ ...filters, sort: filters.sort })}`);
    const rows = jobs
      .map((j) => {
        const salary = formatSalary(j.salaryMin, j.salaryMax, j.salaryCurrency);
        const meta = [j.company.name, j.location, j.remote && !/remote/i.test(j.location) ? "Remote" : null, salary]
          .filter(Boolean)
          .map((s) => escapeHtml(String(s)))
          .join(" · ");
        return `<tr><td style="padding:12px 0;border-bottom:1px solid #e4e4e7">
<a href="${appUrl(`/jobs/${j.id}`)}" style="color:#4f46e5;font-weight:600;text-decoration:none">${escapeHtml(j.title)}</a>
<div style="font-size:13px;color:#52525b;margin-top:2px">${meta}</div></td></tr>`;
      })
      .join("");
    const more = total > jobs.length ? `<p><a href="${seeAll}" style="color:#4f46e5">See all ${total} new jobs →</a></p>` : "";
    await sendMail({
      to: alert.email,
      subject: `${total} new job${total === 1 ? "" : "s"}: ${what}`,
      text:
        `${total} new jobs matching ${what}\n\n` +
        jobs.map((j) => `${j.title} — ${j.company.name} (${j.location})\n${appUrl(`/jobs/${j.id}`)}`).join("\n\n") +
        `\n\nSee all: ${seeAll}\nUnsubscribe: ${unsub}`,
      html: layout(
        `<h1 style="font-size:20px;margin:0 0 4px">${total} new job${total === 1 ? "" : "s"}</h1>
<p style="color:#52525b;margin:0 0 8px">Matching ${escapeHtml(what)}</p>
<table style="width:100%;border-collapse:collapse">${rows}</table>${more}`,
        unsub,
      ),
    });
    await db.alert.update({ where: { id: alert.id }, data: { lastSentAt: now } });
    results.push({ email: alert.email, sent: Math.min(total, DIGEST_LIMIT) });
  }
  return results;
}
