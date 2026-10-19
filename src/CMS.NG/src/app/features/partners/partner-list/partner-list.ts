import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { Partner, PartnerQuery } from '../partner.model';
import { PartnerService } from '../partner.service';

const FILTERS_KEY = 'partner-list-filters';
const SORT_KEY = 'partner-list-sort';
const PAGE_KEY = 'partner-list-page';

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
  selector: 'app-partner-list',
  imports: [
    FormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DrawerModule,
    InputTextModule,
    TableModule,
    ToastModule,
  ],
  templateUrl: './partner-list.html',
})
export class PartnerList implements OnInit {
  private readonly service = inject(PartnerService);
  private readonly router = inject(Router);
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly partners = signal<Partner[]>([]);
  readonly loading = signal(false);
  readonly drawerVisible = signal(false);

  filters: PartnerQuery = load<PartnerQuery>(FILTERS_KEY, {});
  sort: SortState = load<SortState>(SORT_KEY, { field: 'displayOrder', order: 1 });
  page: PageState = load<PageState>(PAGE_KEY, { first: 0, rows: 20 });

  ngOnInit() {
    this.fetch();
  }

  get hasFilters(): boolean {
    return !!this.filters.keyword;
  }

  fetch() {
    this.loading.set(true);
    this.service.query(this.filters).subscribe({
      next: (partners) => {
        this.partners.set(partners);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入合作廠商失敗' });
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
    this.router.navigate(['/partners', 'new']);
  }

  view(partner: Partner) {
    this.router.navigate(['/partners', partner.pkid]);
  }

  edit(partner: Partner) {
    this.router.navigate(['/partners', partner.pkid, 'edit']);
  }

  remove(partner: Partner) {
    this.confirmation.confirm({
      header: '刪除合作廠商',
      message: `確定要刪除主代碼 <b>${partner.pkid}</b>「${partner.name}」？`,
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonProps: { severity: 'danger' },
      accept: () =>
        this.service.delete(partner.pkid).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: '已刪除', detail: partner.name });
            this.fetch();
          },
          error: (err: HttpErrorResponse) => {
            const detail =
              err.status === 409
                ? '此廠商已被課程、認證、課程群組或推廣活動使用，無法刪除'
                : '刪除失敗';
            this.messages.add({ severity: 'error', summary: '錯誤', detail });
          },
        }),
    });
  }
}
