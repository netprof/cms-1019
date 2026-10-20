import { addDays, addYears, mondayOf, parseIso, taipeiToday, toIso } from './date.util';

describe('date.util', () => {
  it('taipeiToday() is the UTC+8 calendar date as a local-midnight Date, whatever the browser time zone', () => {
    expect(taipeiToday(new Date(Date.UTC(2026, 9, 20, 15, 59, 59)))).toEqual(new Date(2026, 9, 20));
    expect(taipeiToday(new Date(Date.UTC(2026, 9, 20, 16, 0, 0)))).toEqual(new Date(2026, 9, 21));
    expect(taipeiToday(new Date(Date.UTC(2026, 11, 31, 16, 0, 0)))).toEqual(new Date(2027, 0, 1));
  });

  it('addDays() crosses month boundaries and goes backwards', () => {
    expect(addDays(new Date(2026, 2, 30), 3)).toEqual(new Date(2026, 3, 2));
    expect(addDays(new Date(2026, 2, 2), -7)).toEqual(new Date(2026, 1, 23));
  });

  it('mondayOf() returns the Monday of a Monday–Sunday week', () => {
    expect(mondayOf(new Date(2026, 2, 16))).toEqual(new Date(2026, 2, 16)); // Mon
    expect(mondayOf(new Date(2026, 2, 18, 15, 30))).toEqual(new Date(2026, 2, 16)); // Wed afternoon
    expect(mondayOf(new Date(2026, 2, 22))).toEqual(new Date(2026, 2, 16)); // Sun
    expect(mondayOf(new Date(2026, 2, 23))).toEqual(new Date(2026, 2, 23)); // next Mon
  });

  it('toIso() uses local date components and zero-pads', () => {
    expect(toIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIso(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('toIso() passes null through', () => {
    expect(toIso(null)).toBeNull();
    expect(toIso(undefined)).toBeNull();
  });

  it('parseIso() builds a local midnight date', () => {
    const d = parseIso('2026-03-09')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(9);
    expect(d.getHours()).toBe(0);
  });

  it('parseIso() tolerates a time suffix and rejects junk', () => {
    expect(parseIso('2026-03-09T00:00:00')!.getDate()).toBe(9);
    expect(parseIso('')).toBeNull();
    expect(parseIso(null)).toBeNull();
    expect(parseIso('not a date')).toBeNull();
  });

  it('round-trips', () => {
    expect(toIso(parseIso('2026-07-15'))).toBe('2026-07-15');
  });

  it('addYears() keeps month and day', () => {
    expect(toIso(addYears(new Date(2026, 5, 3), 10))).toBe('2036-06-03');
  });
});
