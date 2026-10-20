import { Component, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { AuthService } from '@app/core/auth/auth.service';
import { AppUserService } from '../app-user.service';

/**
 * 重設為預設密碼 for one AppUser, used on the AppUser edit form and detail page. Renders nothing
 * unless the signed-in user has the Admin role; the API enforces the same rule (403). Asks for
 * confirmation, then sends only the UserId. The host page provides `<p-toast />`.
 */
@Component({
  selector: 'app-reset-password-button',
  imports: [ButtonModule, ConfirmDialogModule],
  template: `
    @if (auth.isAdmin()) {
      <p-confirmdialog key="reset-password" appendTo="body" />
      <p-button
        id="reset-password-button"
        label="重設為預設密碼"
        icon="pi pi-key"
        severity="warn"
        [outlined]="true"
        [loading]="resetting()"
        (onClick)="confirmReset()"
      />
    }
  `,
})
export class ResetPasswordButton {
  readonly auth = inject(AuthService);
  private readonly service = inject(AppUserService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly userId = input.required<string>();
  /** Emits after a successful reset, e.g. to reload PasswordUpdatedTime. */
  readonly reset = output<void>();

  readonly resetting = signal(false);

  confirmReset() {
    const userId = this.userId();
    this.confirmation.confirm({
      key: 'reset-password',
      header: '重設為預設密碼',
      message: `確定要將帳號「${userId}」的密碼重設為系統預設密碼？`,
      acceptLabel: '重設',
      rejectLabel: '取消',
      acceptButtonProps: { severity: 'warn' },
      accept: () => this.resetPassword(userId),
    });
  }

  private resetPassword(userId: string) {
    this.resetting.set(true);
    this.service.resetPassword(userId).subscribe({
      next: () => {
        this.resetting.set(false);
        this.messages.add({ severity: 'success', summary: '密碼已重設為預設密碼', detail: userId });
        this.reset.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.resetting.set(false);
        const detail =
          err.status === 403 ? '沒有權限重設密碼' : err.status === 404 ? '找不到此使用者' : '重設密碼失敗';
        this.messages.add({ severity: 'error', summary: '錯誤', detail });
      },
    });
  }
}
