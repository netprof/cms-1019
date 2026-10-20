/** Asserts a form's `#form-toolbar` is pinned (global `.sticky-toolbar`) and still holds Save/Cancel. */
export function expectStickyToolbar(host: HTMLElement): void {
  const toolbar = host.querySelector('#form-toolbar') as HTMLElement | null;
  expect(toolbar).withContext('toolbar').not.toBeNull();
  const style = getComputedStyle(toolbar!);
  expect(style.position).toBe('sticky');
  expect(style.top).toBe('0px');
  expect(Number(style.zIndex)).toBeGreaterThan(0);
  expect(toolbar!.querySelector('#save-button')).withContext('save').not.toBeNull();
  expect(toolbar!.querySelector('#cancel-button')).withContext('cancel').not.toBeNull();
}
