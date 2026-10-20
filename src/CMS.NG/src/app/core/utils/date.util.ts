/**
 * Date helpers for `date` columns exchanged with the API as ISO `yyyy-MM-dd` strings.
 *
 * Always use local date components. `toISOString()` converts to UTC first, which shifts
 * the calendar day for UTC+8 users.
 */

/** Local calendar date → `yyyy-MM-dd`; null/undefined pass through as null. */
export function toIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `yyyy-MM-dd` → local `Date` at midnight; null/blank/invalid → null. */
export function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Local midnight `days` after `date` (negative goes back). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Local midnight of the Monday that starts the Monday–Sunday week containing `date`. */
export function mondayOf(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}

/** Same calendar day `years` later (local). */
export function addYears(date: Date, years: number): Date {
  return new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
}
