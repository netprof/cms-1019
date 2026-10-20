import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { parseIso, toIso } from '../../../core/utils/date.util';
import { AppRoleLookup, AppUser, AppUserQuery } from '../app-user.model';
import { AppUserService } from '../app-user.service';

const FILTERS_KEY = 'appuser-list-filters';
const SORT_KEY = 'appuser-list-sort';
const PAGE_KEY = 'appuser-list-page';

interface SortState {
  field: string;
  order: number;
}

interface PageState {
  first: number;
  rows: number;
}

/** Date-range filter values as `Date` objects for the pickers (ISO strings live in `filters`). */
interface DateFilters {
  passwordUpdatedFrom: Date | null;
  passwordUpdatedTo: Date | null;
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
  selector: 'app-app-user-list',
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    DrawerModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
  ],
  templateUrl: './app-user-list.html',
})
export class AppUserList implements OnInit {
  private readonly service = inject(AppUserService);
  private readonly router = inject(Router);
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly users = signal<AppUser[]>([]);
  readonly loading = signal(false);
  readonly drawerVisible = signal(false);
  readonly roles = signal<AppRoleLookup[]>([]);

  /** Tri-state options for the IsActive filter (clearing the select = no filter). */
  readonly activeOptions = [
    { label: '啟用', value: true },
    { label: '停用', value: false },
  ];

  filters: AppUserQuery = load<AppUserQuery>(FILTERS_KEY, {});
  dates: DateFilters = { passwordUpdatedFrom: null, passwordUpdatedTo: null };
  sort: SortState = load<SortState>(SORT_KEY, { field: 'userId', order: 1 });
  page: PageState = load<PageState>(PAGE_KEY, { first: 0, rows: 20 });

  ngOnInit() {
    this.syncDatesFromFilters();
    this.fetch();

    this.service.getRoleLookups().subscribe({
      next: (roles) => this.roles.set(roles),
      error: () =>
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入搜尋選項失敗' }),
    });
  }

  /** Lookup options mapped for p-select. */
  get roleOptions(): { roleId: string; label: string }[] {
    return this.roles().map((r) => ({ roleId: r.roleId, label: `${r.roleName} (${r.roleId})` }));
  }

  get hasFilters(): boolean {
    const f = this.filters;
    return (
      !!f.keyword ||
      f.isActive != null ||
      !!f.roleId ||
      !!f.passwordUpdatedFrom ||
      !!f.passwordUpdatedTo
    );
  }

  private syncDatesFromFilters() {
    this.dates = {
      passwordUpdatedFrom: parseIso(this.filters.passwordUpdatedFrom),
      passwordUpdatedTo: parseIso(this.filters.passwordUpdatedTo),
    };
  }

  fetch() {
    this.loading.set(true);
    this.service.query(this.filters).subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入使用者失敗' });
      },
    });
  }

  applyFilters() {
    this.filters = {
      ...this.filters,
      passwordUpdatedFrom: toIso(this.dates.passwordUpdatedFrom),
      passwordUpdatedTo: toIso(this.dates.passwordUpdatedTo),
    };
    save(FILTERS_KEY, this.filters);
    this.page = { ...this.page, first: 0 };
    save(PAGE_KEY, this.page);
    this.drawerVisible.set(false);
    this.fetch();
  }

  clearFilters() {
    this.filters = {};
    this.dates = { passwordUpdatedFrom: null, passwordUpdatedTo: null };
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
    this.router.navigate(['/app-users', 'new']);
  }

  view(user: AppUser) {
    this.router.navigate(['/app-users', user.userId]);
  }

  edit(user: AppUser) {
    this.router.navigate(['/app-users', user.userId, 'edit']);
  }

  remove(user: AppUser) {
    this.confirmation.confirm({
      header: '刪除使用者',
      message: `確定要刪除帳號「${user.userId}」（${user.userName}）？`,
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonProps: { severity: 'danger' },
      accept: () =>
        this.service.delete(user.userId).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: '已刪除', detail: user.userId });
            this.fetch();
          },
          error: (err: HttpErrorResponse) => {
            const detail =
              err.status === 409 ? '此使用者仍被其他資料使用，無法刪除' : '刪除失敗';
            this.messages.add({ severity: 'error', summary: '錯誤', detail });
          },
        }),
    });
  }
}
