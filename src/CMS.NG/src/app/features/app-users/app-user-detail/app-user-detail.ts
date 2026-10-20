import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { AppRoleLookup, AppUser } from '../app-user.model';
import { AppUserService } from '../app-user.service';
import { ResetPasswordButton } from '../reset-password-button/reset-password-button';
import { RowAuditBadge } from '@app/shared/row-audit/row-audit-badge';

@Component({
  selector: 'app-app-user-detail',
  imports: [DatePipe, ButtonModule, ResetPasswordButton, TagModule, ToastModule, RowAuditBadge],
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
  private readonly messages = inject(MessageService);

  readonly user = signal<AppUser | null>(null);
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

  /** After a password reset: the API returns no body, so re-read PasswordUpdatedTime. */
  reloadUser() {
    this.service.get(this.user()!.userId).subscribe((user) => this.user.set(user));
  }

  back() {
    this.router.navigate(['/app-users']);
  }
}
