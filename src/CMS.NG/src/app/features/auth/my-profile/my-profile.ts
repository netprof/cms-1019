import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '@app/core/auth/auth.service';
import {
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_POLICY_MESSAGE,
  passwordComplexity,
  passwordsMatch,
} from '@app/core/auth/password-policy';

/** Whitespace-only counts as empty, matching the API's [Required]. */
const notBlank = Validators.pattern(/\S/);

type PasswordField = 'currentPassword' | 'newPassword' | 'confirmPassword';

/**
 * The signed-in user's own profile: only UserName is editable. UserId and roles come from
 * the stored login profile / token and are display-only. A separate form changes the password.
 */
@Component({
  selector: 'app-my-profile',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, PasswordModule, TagModule, ToastModule],
  templateUrl: './my-profile.html',
  styles: `
    .roles {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .hint {
      color: #6b7280;
      font-size: 0.8rem;
    }
  `,
})
export class MyProfile {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  readonly auth = inject(AuthService);

  readonly policyMessage = PASSWORD_POLICY_MESSAGE;
  readonly mismatchMessage = PASSWORD_MISMATCH_MESSAGE;

  readonly saving = signal(false);
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    userName: [
      this.auth.profile()?.userName ?? '',
      [Validators.required, notBlank, Validators.maxLength(200)],
    ],
  });

  readonly changingPassword = signal(false);
  readonly passwordSubmitted = signal(false);
  /** Field errors from the API's 400, shown until that field is edited again. */
  readonly serverErrors = signal<Partial<Record<PasswordField, string>>>({});

  readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, passwordComplexity]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch('newPassword', 'confirmPassword') },
  );

  constructor() {
    for (const name of Object.keys(this.passwordForm.controls) as PasswordField[]) {
      this.passwordForm.controls[name].valueChanges.subscribe(() =>
        this.serverErrors.update(({ [name]: _, ...rest }) => rest),
      );
    }
  }

  invalid(): boolean {
    const c = this.form.controls.userName;
    return c.invalid && (c.touched || this.submitted());
  }

  save() {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.auth.updateProfile(this.form.getRawValue().userName.trim()).subscribe({
      next: ({ userName }) => {
        this.saving.set(false);
        this.form.setValue({ userName });
        this.messages.add({ severity: 'success', summary: '已儲存', detail: '名稱已更新' });
      },
      error: () => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '儲存失敗，請稍後再試' });
      },
    });
  }

  cancel() {
    this.router.navigate(['/']);
  }

  /** The message to show under a password field, or null; client rules first, then the API's. */
  passwordError(name: PasswordField): string | null {
    const c = this.passwordForm.controls[name];
    const shown = c.touched || this.passwordSubmitted();
    if (shown && c.hasError('required')) {
      return { currentPassword: '請輸入目前密碼', newPassword: '請輸入新密碼', confirmPassword: '請再次輸入新密碼' }[name];
    }
    if (name === 'newPassword' && shown && c.hasError('passwordComplexity')) return this.policyMessage;
    if (name === 'confirmPassword' && shown && this.passwordForm.hasError('passwordMismatch')) {
      return this.mismatchMessage;
    }
    return this.serverErrors()[name] ?? null;
  }

  changePassword() {
    this.passwordSubmitted.set(true);
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.changingPassword.set(true);
    this.auth.changePassword(this.passwordForm.getRawValue()).subscribe({
      next: () => {
        this.changingPassword.set(false);
        this.passwordSubmitted.set(false);
        this.passwordForm.reset();
        this.messages.add({ severity: 'success', summary: '已變更', detail: '密碼已變更' });
      },
      error: (err: HttpErrorResponse) => {
        this.changingPassword.set(false);
        const errors = err.status === 400 ? fieldErrors(err.error) : {};
        this.serverErrors.set(errors);
        if (Object.keys(errors).length === 0) {
          this.messages.add({ severity: 'error', summary: '錯誤', detail: '變更密碼失敗，請稍後再試' });
        }
      },
    });
  }
}

/** First message per field from an ASP.NET ValidationProblem, whatever the key casing. */
function fieldErrors(body: unknown): Partial<Record<PasswordField, string>> {
  const errors = (body as { errors?: Record<string, string[]> } | null)?.errors ?? {};
  const result: Partial<Record<PasswordField, string>> = {};
  for (const field of ['currentPassword', 'newPassword', 'confirmPassword'] as PasswordField[]) {
    const key = Object.keys(errors).find((k) => k.toLowerCase() === field.toLowerCase());
    if (key && errors[key]?.length) result[field] = errors[key][0];
  }
  return result;
}
