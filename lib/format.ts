const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// $1,234.56
export function formatMoney(value: number) {
  return money.format(value);
}

// $8k
export function formatMoneyShort(value: number) {
  return value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`;
}

// Jan 2026 (dates are stored at UTC so they never shift months)
export function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

// Jan '26
export function formatMonthShort(iso: string) {
  const d = new Date(iso);
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} '${String(d.getUTCFullYear()).slice(2)}`;
}

// Jan 31, 2026
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
}
