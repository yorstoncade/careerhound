import { NextResponse, type NextRequest } from "next/server";
import { sendConfirmation } from "@/lib/alerts";
import { prisma } from "@/lib/db";
import { filtersToQuery, parseFilters } from "@/lib/search";
import { newToken } from "@/lib/tokens";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ALERTS_PER_EMAIL = 20;

export async function POST(req: NextRequest) {
  let body: { email?: unknown; frequency?: unknown; query?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }
  const frequency = body.frequency === "weekly" ? "weekly" : "daily";
  const filters = parseFilters(new URLSearchParams(String(body.query ?? "")));

  const count = await prisma.alert.count({ where: { email } });
  if (count >= MAX_ALERTS_PER_EMAIL) {
    return NextResponse.json({ error: "This email already has the maximum number of alerts" }, { status: 429 });
  }

  const alert = await prisma.alert.create({
    data: { email, frequency, query: filtersToQuery(filters), confirmToken: newToken(), unsubToken: newToken() },
  });
  await sendConfirmation(alert);
  return NextResponse.json({ ok: true }, { status: 201 });
}
