import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const { count } = token ? await prisma.alert.deleteMany({ where: { unsubToken: token } }) : { count: 0 };
  return NextResponse.redirect(new URL(`/?alert=${count ? "unsubscribed" : "invalid"}`, req.url));
}
