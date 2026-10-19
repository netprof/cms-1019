import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DrawerModule } from 'primeng/drawer';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { AppRole, AppRoleQuery } from '../app-role.model';
import { AppRoleService } from '../app-role.service';

const FILTERS_KEY = 'approle-list-filters';
const SORT_KEY = 'approle-list-sort';
const PAGE_KEY = 'approle-list-page';

interface SortState {
  field: string;
  order: number;
}

interface PageState {
  first: number;
  rows: number;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable; state simply isn't remembered
  }
}

@Component({
  selector: 'app-app-role-list',
  imports: [
    FormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DrawerModule,
    InputNumberModule,
    InputTextModule,
    TableModule,
    ToastModule,
  ],
  templateUrl: './app-role-list.html',
})
export class AppRoleList implements OnInit {
  private readonly service = inject(AppRoleService);
  private readonly router = inject(Router);
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly roles = signal<AppRole[]>([]);
  readonly loading = signal(false);
  readonly drawerVisible = signal(false);

  filters: AppRoleQuery = load<AppRoleQuery>(FILTERS_KEY, {});
  sort: SortState = load<SortState>(SORT_KEY, { field: 'roleId', order: 1 });
  page: PageState = load<PageState>(PAGE_KEY, { first: 0, rows: 20 });

  ngOnInit() {
    this.fetch();
  }

  get hasFilters(): boolean {
    const f = this.filters;
    return !!f.keyword || f.minPermissionLevel != null || f.maxPermissionLevel != null;
  }

  fetch() {
    this.loading.set(true);
    this.service.query(this.filters).subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入角色失敗' });
      },
    });
  }

  applyFilters() {
    save(FILTERS_KEY, this.filters);
    this.page = { ...this.page, first: 0 };
    save(PAGE_KEY, this.page);
    this.drawerVisible.set(false);
    this.fetch();
  }

  clearFilters() {
    this.filters = {};
    this.applyFilters();
  }

  onSort(event: { field: string; order: number }) {
    this.sort = { field: event.field, order: event.order };
    save(SORT_KEY, this.sort);
  }

  onPage(event: { first: number; rows: number }) {
    this.page = { first: event.first, rows: event.rows };
    save(PAGE_KEY, this.page);
  }

  add() {
    this.router.navigate(['/app-roles', 'new']);
  }

  view(role: AppRole) {
    this.router.navigate(['/app-roles', role.roleId]);
  }

  edit(role: AppRole) {
    this.router.navigate(['/app-roles', role.roleId, 'edit']);
  }

  remove(role: AppRole) {
    this.confirmation.confirm({
      header: '刪除角色',
      message: `確定要刪除角色「${role.roleId}」嗎？`,
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonProps: { severity: 'danger' },
      accept: () =>
        this.service.delete(role.roleId).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: '已刪除', detail: role.roleId });
            this.fetch();
          },
          error: () =>
            this.messages.add({ severity: 'error', summary: '錯誤', detail: '刪除失敗' }),
        }),
    });
  }
}
