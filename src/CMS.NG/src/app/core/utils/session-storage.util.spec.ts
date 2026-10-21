import { loadSession, saveSession } from './session-storage.util';

describe('session-storage.util', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('loads what was saved', () => {
    saveSession('k', { field: 'cost', order: -1 });

    expect(loadSession<unknown>('k', null)).toEqual({ field: 'cost', order: -1 });
  });

  it('falls back when nothing is saved', () => {
    expect(loadSession('k', 'fallback')).toBe('fallback');
  });

  it('falls back when the saved value is not JSON', () => {
    sessionStorage.setItem('k', '{oops');

    expect(loadSession('k', 'fallback')).toBe('fallback');
  });
});
