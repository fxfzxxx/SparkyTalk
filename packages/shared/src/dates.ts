/** All business dates are local to New Zealand. */
export const NZ_TIME_ZONE = "Pacific/Auckland";

/** A calendar date as YYYY-MM-DD (no time, no zone). */
export type LocalDate = string;

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: string): value is LocalDate {
  return LOCAL_DATE_RE.test(value);
}

/** The calendar date in New Zealand at the given instant. */
export function nzDate(at: Date = new Date()): LocalDate {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NZ_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/** Weekday name in English for a local date, e.g. "Tuesday". */
export function weekday(date: LocalDate): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NZ", {
    weekday: "long",
    timeZone: "UTC",
  });
}
