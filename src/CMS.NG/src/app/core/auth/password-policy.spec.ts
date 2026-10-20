import { FormControl, FormGroup } from '@angular/forms';
import { isPasswordComplex, passwordComplexity, passwordsMatch } from './password-policy';

describe('password policy', () => {
  // Same cases as the API's PasswordPolicyTests, so the two rules stay in step.
  it('accepts 8+ characters with at least 3 of the 4 classes', () => {
    for (const ok of ['Abcdef1#', 'Abcdefg1', 'abcdefg#1', 'ABCDEFG#1', 'Abcdefg#', '密碼密碼Ab12']) {
      expect(isPasswordComplex(ok)).withContext(ok).toBeTrue();
    }
  });

  it('rejects short passwords and fewer than 3 classes', () => {
    for (const bad of ['', 'Ab1#xyz', 'abcdefgh', 'abcdefg1', 'ABCDEFG#', 'abcd 1234', '密碼密碼abcd']) {
      expect(isPasswordComplex(bad)).withContext(bad).toBeFalse();
    }
  });

  it('passwordComplexity leaves an empty value to required', () => {
    expect(passwordComplexity(new FormControl(''))).toBeNull();
    expect(passwordComplexity(new FormControl('short'))).toEqual({ passwordComplexity: true });
    expect(passwordComplexity(new FormControl('Abcdefg1'))).toBeNull();
  });

  it('passwordsMatch flags two filled, different values only', () => {
    const group = (a: string, b: string) =>
      new FormGroup({ next: new FormControl(a), confirm: new FormControl(b) });
    const validator = passwordsMatch('next', 'confirm');

    expect(validator(group('Abcdefg1', 'Abcdefg2'))).toEqual({ passwordMismatch: true });
    expect(validator(group('Abcdefg1', 'Abcdefg1'))).toBeNull();
    expect(validator(group('Abcdefg1', ''))).toBeNull();
  });
});
