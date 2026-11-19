const DECIMALS: Record<string, number> = { BHD: 3, JOD: 3, KWD: 3, OMR: 3, TND: 3, JPY: 0, KRW: 0, VND: 0 };

export function decimals(currency: string): number {
  return DECIMALS[currency] ?? 2;
}

/** Minor units (as stored by the API) to a plain decimal string for forms. */
export function minorToDecimal(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "";
  const d = decimals(currency);
  const negative = minor < 0;
  const digits = Math.abs(minor).toString().padStart(d + 1, "0");
  const whole = digits.slice(0, digits.length - d);
  return (negative ? "-" : "") + whole + (d ? `.${digits.slice(-d)}` : "");
}

/** Minor units to display text, e.g. "LKR 1,250,000.00". */
export function formatMoney(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "—";
  const d = decimals(currency);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(minor / 10 ** d);
  } catch {
    return `${currency} ${minorToDecimal(minor, currency)}`;
  }
}
