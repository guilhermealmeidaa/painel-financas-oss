/**
 * Datas como strings ISO ("YYYY-MM-DD") e meses como "YYYY-MM-01",
 * sempre no fuso America/Sao_Paulo. Evita Date em UTC para não errar o dia.
 */
export const TZ = "America/Sao_Paulo";

/**
 * Hoje em São Paulo, "YYYY-MM-DD".
 * Em Server Components, chame `await connection()` antes (Next 16 + Cache Components).
 */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "2026-11-11" -> "2026-11-01" */
export function monthOf(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
}

/** Quantos meses de `from` até `to` (ambos "YYYY-MM-01"). */
export function monthsBetween(from: string, to: string): number {
  return (
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    (Number(to.slice(5, 7)) - Number(from.slice(5, 7)))
  );
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

// Aritmética de dia usando UTC só como calendário (sem fuso envolvido).
function toUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}
/** 0 = domingo ... 6 = sábado */
export function weekday(iso: string): number {
  return toUTC(iso).getUTCDay();
}
export function lastDayOfMonth(month: string): string {
  return addDays(addMonths(month, 1), -1);
}

const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });
const monthLongFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

/** "2026-12-01" -> "dez/26" */
export function formatMonthShort(month: string): string {
  return monthFmt.format(toUTC(month)).replace(". de ", "/").replace(" de ", "/").replace(".", "");
}
/** "2026-12-01" -> "dezembro de 2026" */
export function formatMonthLong(month: string): string {
  return monthLongFmt.format(toUTC(month));
}
/** "2026-11-06" -> "06/11" */
export function formatDay(iso: string): string {
  return dayFmt.format(toUTC(iso));
}
