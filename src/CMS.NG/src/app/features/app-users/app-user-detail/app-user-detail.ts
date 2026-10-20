import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { AppRoleLookup, AppUser } from '../app-user.model';
import { AppUserService } from '../app-user.service';

@Component({
  selector: 'app-app-user-detail',
  imports: [DatePipe, ButtonModule, ConfirmDialogModule, TagModule, ToastModule],
  templateUrl: './app-user-detail.html',
  styles: `
    dl {
      display: grid;
      grid-template-columns: 10rem 1fr;
      gap: 0.75rem 1rem;
      margin: 0;
    }
    dt {
      font-weight: 600;
      color: #6b7280;
    }
    dd {
      margin: 0;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
  `,
})
export class AppUserDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(AppUserService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly user = signal<AppUser | null>(null);
  readonly resetting = signal(false);
  private readonly roles = signal<AppRoleLookup[]>([]);

  /** Assigned roles resolved to display labels. */
  readonly assignedRoles = computed(() => {
    const user = this.user();
    if (!user) return [];
    const byId = new Map(this.roles().map((r) => [r.roleId, r]));
    return user.roleIds.map((id) => {
      const role = byId.get(id);
      return role ? `${role.roleName} (${id})` : id;
    });
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    forkJoin({ user: this.service.get(id), roles: this.service.getRoleLookups() }).subscribe({
      next: ({ user, roles }) => {
        this.roles.set(roles);
        this.user.set(user);
      },
      error: () =>
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入使用者失敗' }),
    });
  }

  edit() {
    this.router.navigate(['/app-users', this.user()!.userId, 'edit']);
  }

  /** Resets the password to the system default (server-side; the password is never shown). */
  resetPassword() {
    const user = this.user()!;
    this.confirmation.confirm({
      header: '重設密碼',
      message: `確定要將帳號「${user.userId}」的密碼重設為系統預設密碼？`,
      acceptLabel: '重設',
      rejectLabel: '取消',
      acceptButtonProps: { severity: 'warn' },
      accept: () => {
        this.resetting.set(true);
        this.service.resetPassword(user.userId).subscribe({
          next: (updated) => {
            this.resetting.set(false);
            this.user.set(updated);
            this.messages.add({ severity: 'success', summary: '密碼已重設', detail: user.userId });
          },
          error: () => {
            this.resetting.set(false);
            this.messages.add({ severity: 'error', summary: '錯誤', detail: '重設密碼失敗' });
          },
        });
      },
    });
  }

  back() {
    this.router.navigate(['/app-users']);
  }
}
