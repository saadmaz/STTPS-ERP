import { Injectable, Logger } from "@nestjs/common";

export interface SmsMessage {
  to: string;
  body: string;
  channel: "sms" | "whatsapp";
}

/**
 * Outbound SMS/WhatsApp via Twilio's REST API (a plain `fetch` call with
 * HTTP basic auth — no SDK needed for one endpoint, the same choice
 * `EmailSender` already made for Resend). Uses `TWILIO_ACCOUNT_SID`/
 * `TWILIO_AUTH_TOKEN`/`TWILIO_SMS_FROM`/`TWILIO_WHATSAPP_FROM`; unset means
 * log-and-no-op, the same pattern as every other optional external
 * integration in this codebase.
 */
@Injectable()
export class SmsSender {
  private readonly logger = new Logger("SMS");

  async send(message: SmsMessage): Promise<void> {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = message.channel === "whatsapp" ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_SMS_FROM;
    if (!sid || !token || !from) {
      this.logger.debug(`(${message.channel} not configured) to=${message.to} body="${message.body}"`);
      return;
    }
    const prefix = message.channel === "whatsapp" ? "whatsapp:" : "";
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const body = new URLSearchParams({ To: `${prefix}${message.to}`, From: `${prefix}${from}`, Body: message.body });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    if (!response.ok) {
      // Throwing makes the job retry with backoff.
      throw new Error(`Twilio returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
  }
}
