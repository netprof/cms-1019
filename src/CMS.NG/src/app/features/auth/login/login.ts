import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '@app/core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, MessageModule, PasswordModule],
  templateUrl: './login.html',
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }

    .card {
      width: 100%;
      max-width: 360px;
    }

    h1 {
      margin: 0 0 1.25rem;
      font-size: 1.35rem;
      text-align: center;
    }

    p-message {
      display: block;
      margin-bottom: 1rem;
    }
  `,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    userId: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  invalid(name: 'userId' | 'password'): boolean {
    return this.submitted() && this.form.controls[name].invalid;
  }

  submit() {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) return;

    const { userId, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.auth.login(userId.trim(), password).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl(this.returnUrl());
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err.status === 401 ? '帳號或密碼錯誤' : '登入失敗，請稍後再試');
      },
    });
  }

  /** Only same-app paths, so a crafted link cannot send the user elsewhere after login. */
  private returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/login') ? url : '/';
  }
}
