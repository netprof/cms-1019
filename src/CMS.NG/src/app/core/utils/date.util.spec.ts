import { addYears, parseIso, toIso } from './date.util';

describe('date.util', () => {
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
