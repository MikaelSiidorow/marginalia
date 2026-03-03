import { createTransport, type Transporter } from "nodemailer";
import { desc, eq } from "drizzle-orm";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { dev } from "$app/environment";
import { env } from "$lib/server/env";
import { db } from "../db";
import { notificationDelivery } from "../db/schema";

const tracer = trace.getTracer("marginalia-notifications");

let cachedTransport: Transporter | undefined;

interface Email {
  subject: string;
  html: string;
  text: string;
}

/**
 * Send an email via SMTP.
 *
 * This is used as the transport for @mikstack/notifications emailChannel.
 * Delivery tracking (status, retries, errors) is handled by the notifications system.
 *
 * In dev mode, SMTP is skipped — emails are logged to the console and a preview link is shown.
 *
 * The SMTP transport uses nodemailer. Easy to replace with your preferred provider:
 *   - Resend: https://resend.com/docs
 *   - Postmark: https://postmarkapp.com/developer
 *   - Mailgun: https://documentation.mailgun.com
 *   - AWS SES, SendGrid, etc.
 */
export async function sendEmail(to: string, email: Email): Promise<void> {
  return tracer.startActiveSpan("email.send", async (span) => {
    // Add attributes (domain only, not full email for privacy)
    const domain = to.split("@")[1] || "unknown";
    span.setAttribute("email.recipient_domain", domain);
    span.setAttribute("email.subject", email.subject);

    try {
      if (dev) {
        span.setAttribute("email.mode", "dev");
        const [delivery] = await db
          .select({ id: notificationDelivery.id })
          .from(notificationDelivery)
          .where(eq(notificationDelivery.recipientEmail, to))
          .orderBy(desc(notificationDelivery.createdAt))
          .limit(1);

        const previewUrl = delivery
          ? `http://localhost:5173/api/dev/emails/${delivery.id}`
          : "http://localhost:5173/api/dev/emails";

        console.log(
          `\n✉️  Email: "${email.subject}" → ${to}` +
            `\n${"─".repeat(60)}` +
            `\n${email.text}` +
            `\n${"─".repeat(60)}` +
            `\n🔗 Preview: ${previewUrl}\n`,
        );
        span.setStatus({ code: SpanStatusCode.OK });
        return;
      }

      span.setAttribute("email.mode", "smtp");
      const host = env.SMTP_HOST;
      const port = Number(env.SMTP_PORT ?? 587);
      const user = env.SMTP_USER;
      const pass = env.SMTP_PASS;
      const from = env.SMTP_FROM ?? "noreply@example.com";

      if (!host || !user || !pass) {
        const error = new Error(
          "SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env",
        );
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      }

      span.setAttribute("smtp.host", host);
      span.setAttribute("smtp.port", port);

      if (!cachedTransport) {
        cachedTransport = createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
      }

      await cachedTransport.sendMail({
        from,
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}
