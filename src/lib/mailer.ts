import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transport: nodemailer.Transporter | null = null;

function getTransport() {
  if (transport) return transport;
  if (process.env.SMTP_HOST) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } else {
    // Development: build the message but don't send it; we write it to ./outbox instead.
    transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  }
  return transport;
}

/** Send an email. Without SMTP_HOST, writes an .eml file to ./outbox and returns its path. */
export async function sendMail(mail: Mail): Promise<string | null> {
  const from = process.env.MAIL_FROM ?? "JobScout <alerts@example.com>";
  const info = await getTransport().sendMail({ from, ...mail });
  if (process.env.SMTP_HOST) return null;
  const dir = path.join(process.cwd(), "outbox");
  await mkdir(dir, { recursive: true });
  const safe = mail.to.replace(/[^a-z0-9@.]/gi, "_");
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}_${safe}.eml`);
  await writeFile(file, (info as unknown as { message: Buffer }).message);
  return file;
}
