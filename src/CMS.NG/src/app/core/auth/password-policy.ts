import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * New-password rule, mirrored from the API's `Services/PasswordPolicy.cs` (keep the two in step):
 * at least 8 characters and at least 3 of 4 classes — uppercase A–Z, lowercase a–z, digit 0–9,
 * symbol (any other non-whitespace character). The API re-checks; this only saves a round trip.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MIN_CLASSES = 3;

export const PASSWORD_POLICY_MESSAGE =
  '密碼長度至少需 8 碼，且內容須至少包含四種字元的其中三種：大寫英文／小寫英文／數字／符號 ' +
  '(Password must be at least 8 characters and contain at least 3 of the 4 classes: ' +
  'uppercase / lowercase / digit / symbol.)';

export const PASSWORD_MISMATCH_MESSAGE =
  '新密碼與確認密碼不一致 (New password and confirmation do not match.)';

export function isPasswordComplex(password: string): boolean {
  if (password.length < PASSWORD_MIN_LENGTH) return false;
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9\s]/].filter((re) => re.test(password));
  return classes.length >= PASSWORD_MIN_CLASSES;
}

/** `{ passwordComplexity: true }` when a non-empty value breaks the rule (empty is left to `required`). */
export const passwordComplexity: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  control.value && !isPasswordComplex(control.value) ? { passwordComplexity: true } : null;

/** Group validator: `{ passwordMismatch: true }` when both fields are filled and differ. */
export function passwordsMatch(newKey: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const next = group.get(newKey)?.value;
    const confirm = group.get(confirmKey)?.value;
    return next && confirm && next !== confirm ? { passwordMismatch: true } : null;
  };
}
