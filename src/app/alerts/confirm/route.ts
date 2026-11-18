import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const alert = token ? await prisma.alert.findUnique({ where: { confirmToken: token } }) : null;
  if (alert && !alert.confirmed) {
    // Start the digest window now so the first email only contains jobs found after confirming.
    await prisma.alert.update({ where: { id: alert.id }, data: { confirmed: true, lastSentAt: new Date() } });
  }
  return NextResponse.redirect(new URL(`/?alert=${alert ? "confirmed" : "invalid"}`, req.url));
}
