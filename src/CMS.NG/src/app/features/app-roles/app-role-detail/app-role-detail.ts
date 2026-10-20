import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { AppRole, AppUserLookup } from '../app-role.model';
import { AppRoleService } from '../app-role.service';
import { RowAuditBadge } from '@app/shared/row-audit/row-audit-badge';

@Component({
  selector: 'app-app-role-detail',
  imports: [ButtonModule, TagModule, ToastModule, RowAuditBadge],
  templateUrl: './app-role-detail.html',
  styles: `
    dl {
      display: grid;
      grid-template-columns: 8rem 1fr;
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
export class AppRoleDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(AppRoleService);
  private readonly messages = inject(MessageService);

  readonly role = signal<AppRole | null>(null);
  private readonly users = signal<AppUserLookup[]>([]);

  /** Assigned users resolved to display labels. */
  readonly assignedUsers = computed(() => {
    const role = this.role();
    if (!role) return [];
    const byId = new Map(this.users().map((u) => [u.userId, u]));
    return role.userIds.map((id) => {
      const user = byId.get(id);
      return user ? `${user.userName} (${id})` : id;
    });
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    forkJoin({ role: this.service.get(id), users: this.service.getUserLookups() }).subscribe({
      next: ({ role, users }) => {
        this.users.set(users);
        this.role.set(role);
      },
      error: () =>
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入角色失敗' }),
    });
  }

  edit() {
    this.router.navigate(['/app-roles', this.role()!.roleId, 'edit']);
  }

  back() {
    this.router.navigate(['/app-roles']);
  }
}
