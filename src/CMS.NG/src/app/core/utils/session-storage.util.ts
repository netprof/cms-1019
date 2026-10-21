/**
 * Per-tab UI state (filters, sort, page, ...) kept as JSON in `sessionStorage`. Storage may be
 * unavailable or hold garbage, so reads fall back and writes fail silently: state simply isn't remembered.
 */

/** The JSON value saved under `key`, or `fallback` when there is none or it can't be read. */
export function loadSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Saves `value` as JSON under `key`; does nothing when storage is unavailable. */
export function saveSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable; state simply isn't remembered
  }
}
