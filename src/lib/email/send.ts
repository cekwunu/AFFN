import 'server-only';
import nodemailer from 'nodemailer';
import { serverEnv } from '@/lib/env.server';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transport: nodemailer.Transporter | undefined;

/**
 * Sends an email over SMTP (Mailpit locally, an EU provider in production). Provider-neutral:
 * switching provider is a configuration change. Without SMTP_HOST in development, the message
 * is logged instead.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!serverEnv.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP_HOST is not set.');
    console.info(`[email] to=${message.to} subject=${message.subject}\n${message.text}`);
    return;
  }
  transport ??= nodemailer.createTransport({
    host: serverEnv.SMTP_HOST,
    port: serverEnv.SMTP_PORT,
    secure: serverEnv.SMTP_SECURE === 'true',
    auth: serverEnv.SMTP_USER
      ? { user: serverEnv.SMTP_USER, pass: serverEnv.SMTP_PASS }
      : undefined,
  });
  await transport.sendMail({ from: serverEnv.EMAIL_FROM, ...message });
}
