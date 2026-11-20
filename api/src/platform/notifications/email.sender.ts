import { Injectable, Logger } from "@nestjs/common";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Outbound email. Uses Resend's HTTP API when RESEND_API_KEY is set (an HTTP
 * provider works from Cloudflare Containers, where outbound SMTP is not
 * dependable); otherwise logs the message, which is what development and
 * tests want.
 */
@Injectable()
export class EmailSender {
  private readonly logger = new Logger("Email");

  async send(message: EmailMessage): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM ?? "STTPS ERP <no-reply@sttps.co>";
    if (!apiKey) {
      this.logger.debug(`(email not configured) to=${message.to} subject="${message.subject}"`);
      return;
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
    });
    if (!response.ok) {
      // Throwing makes the job retry with backoff.
      throw new Error(`Email provider returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
  }
}
