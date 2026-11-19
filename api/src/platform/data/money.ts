/**
 * Money and quantity arithmetic without floating point.
 *
 * Amounts are stored as integers in the currency's minor unit (cents for LKR
 * and USD, fils for KWD). Quantities are stored as integers in thousandths of
 * a unit. Every value crossing the API boundary is a decimal string, parsed
 * here exactly, so `0.1 + 0.2` problems never reach a ledger.
 */

const DECIMALS: Record<string, number> = {
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
};

/** Number of minor-unit digits for an ISO 4217 code (2 unless listed above). */
export function currencyDecimals(currency: string): number {
  return DECIMALS[currency.toUpperCase()] ?? 2;
}

/** Quantities carry three decimal places. */
export const QTY_SCALE = 1000;
const QTY_DECIMALS = 3;

const DECIMAL_RE = /^([+-])?(\d+)(?:\.(\d+))?$/;

/**
 * Parses a decimal string (or a finite number) into an integer scaled by
 * 10^decimals, rounding half away from zero beyond the allowed precision.
 */
export function parseScaled(value: string | number, decimals: number): number {
  const text = typeof value === "number" ? numberToPlainString(value) : value.trim();
  const match = DECIMAL_RE.exec(text);
  if (!match) throw new RangeError(`Not a decimal number: "${value}"`);
  const [, sign, whole, fraction = ""] = match;
  const kept = fraction.slice(0, decimals).padEnd(decimals, "0");
  let scaled = BigInt(whole + kept);
  const nextDigit = fraction.charCodeAt(decimals) - 48;
  if (nextDigit >= 5) scaled += 1n;
  if (sign === "-" && scaled !== 0n) scaled = -scaled;
  const result = Number(scaled);
  if (!Number.isSafeInteger(result)) throw new RangeError(`Amount out of range: "${value}"`);
  return result;
}

/** Formats an integer scaled by 10^decimals as a plain decimal string. */
export function formatScaled(scaled: number, decimals: number): string {
  assertInteger(scaled);
  const negative = scaled < 0;
  const digits = Math.abs(scaled).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? "." + digits.slice(digits.length - decimals) : "";
  return (negative ? "-" : "") + whole + fraction;
}

export function toMinor(amount: string | number, currency: string): number {
  return parseScaled(amount, currencyDecimals(currency));
}

export function fromMinor(minor: number, currency: string): string {
  return formatScaled(minor, currencyDecimals(currency));
}

export function toQty(quantity: string | number): number {
  return parseScaled(quantity, QTY_DECIMALS);
}

export function fromQty(qty: number): string {
  return formatScaled(qty, QTY_DECIMALS);
}

/** Line amount in minor units for a quantity (thousandths) at a unit price (minor units), rounded half away from zero. */
export function extend(qty: number, unitPriceMinor: number): number {
  assertInteger(qty);
  assertInteger(unitPriceMinor);
  return divRound(BigInt(qty) * BigInt(unitPriceMinor), BigInt(QTY_SCALE));
}

/** `amount * rate / 10^rateDecimals`, for percentages (tax, discount) held as scaled integers. */
export function applyRate(amountMinor: number, rate: number, rateDecimals = 4): number {
  assertInteger(amountMinor);
  assertInteger(rate);
  return divRound(BigInt(amountMinor) * BigInt(rate), 10n ** BigInt(rateDecimals));
}

/** The net (pre-tax) amount backed out of a tax-inclusive `amountMinor`, at `rate` / 10^rateDecimals. */
export function netOfTax(amountMinor: number, rate: number, rateDecimals = 4): number {
  assertInteger(amountMinor);
  assertInteger(rate);
  const scale = 10n ** BigInt(rateDecimals);
  return divRound(BigInt(amountMinor) * scale, scale + BigInt(rate));
}

/**
 * Splits `total` into parts proportional to `weights` so the parts always sum
 * to `total` exactly (largest-remainder method). Used for allocating payments,
 * discounts and landed costs across lines.
 */
export function allocate(total: number, weights: number[]): number[] {
  assertInteger(total);
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) throw new RangeError("Allocation weights must sum to a positive number");
  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);
  const exact = weights.map((w) => (magnitude * w) / weightSum);
  const parts = exact.map(Math.floor);
  let remainder = magnitude - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; remainder > 0; i = (i + 1) % order.length, remainder--) parts[order[i]!.index]! += 1;
  return parts.map((p) => p * sign);
}

export function sum(values: number[]): number {
  const total = values.reduce((a, b) => a + b, 0);
  assertInteger(total);
  return total;
}

function divRound(numerator: bigint, denominator: bigint): number {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  let q = n / d;
  if ((n % d) * 2n >= d) q += 1n;
  const result = Number(negative ? -q : q);
  if (!Number.isSafeInteger(result)) throw new RangeError("Amount out of range");
  return result;
}

function assertInteger(value: number): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Expected a safe integer, got ${value}`);
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
  // toFixed(10) avoids exponent notation for small and large magnitudes alike.
  return value.toFixed(10).replace(/\.?0+$/, "") || "0";
}
