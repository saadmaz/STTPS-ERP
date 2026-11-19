import { BadRequestException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

// ─── Hashing ────────────────────────────────────────────────────────────────

/** SHA-256 hex. Refresh tokens and recovery codes are stored only as hashes. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// ─── Password policy ────────────────────────────────────────────────────────

/** At least 10 characters with a letter and a digit, and not the email address. */
export function assertStrongPassword(password: string, email?: string | null): void {
  const problems: string[] = [];
  if (password.length < 10) problems.push("at least 10 characters");
  if (!/[A-Za-z]/.test(password)) problems.push("a letter");
  if (!/\d/.test(password)) problems.push("a digit");
  if (problems.length) throw new BadRequestException(`Password needs ${problems.join(", ")}`);
  if (email && password.toLowerCase().includes(email.toLowerCase().split("@")[0]!) && email.split("@")[0]!.length >= 4) {
    throw new BadRequestException("Password must not contain your email name");
  }
}

// ─── Secret box (MFA secrets at rest) ───────────────────────────────────────

function key(): Buffer {
  const secret = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");
  return Buffer.from(hkdfSync("sha256", secret, "sttps-erp", "mfa-secret-v1", 32));
}

/** AES-256-GCM; output is "v1.<iv>.<tag>.<ciphertext>" in base64url. */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function open(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unreadable secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

// ─── TOTP (RFC 6238, SHA-1, 6 digits, 30 s) ──────────────────────────────────

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 30_000);
}

/**
 * Returns the matched time step (allowing one step of clock drift either
 * way), or null. Callers reject steps at or before the last one used, so a
 * code cannot be replayed.
 */
export function verifyTotp(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = currentStep(now);
  for (const s of [step - 1, step, step + 1]) {
    const expected = Buffer.from(totpAt(secret, s));
    if (timingSafeEqual(expected, Buffer.from(code))) return s;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string, issuer = "STTPS ERP"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Ten single-use recovery codes like "4f9a-c21b-77de". */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => randomBytes(6).toString("hex").match(/.{4}/g)!.join("-"));
}
