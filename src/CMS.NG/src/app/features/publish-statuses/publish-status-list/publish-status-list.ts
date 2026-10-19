import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { PublishStatus, PublishStatusQuery } from '../publish-status.model';
import { PublishStatusService } from '../publish-status.service';

const FILTERS_KEY = 'publishstatus-list-filters';
const SORT_KEY = 'publishstatus-list-sort';
const PAGE_KEY = 'publishstatus-list-page';

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
  selector: 'app-publish-status-list',
  imports: [
    FormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DrawerModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
  ],
  templateUrl: './publish-status-list.html',
})
export class PublishStatusList implements OnInit {
  private readonly service = inject(PublishStatusService);
  private readonly router = inject(Router);
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly statuses = signal<PublishStatus[]>([]);
  readonly loading = signal(false);
  readonly drawerVisible = signal(false);

  /** Tri-state options for the bit-column filters (clearing the select = no filter). */
  readonly boolOptions = [
    { label: '是', value: true },
    { label: '否', value: false },
  ];

  filters: PublishStatusQuery = load<PublishStatusQuery>(FILTERS_KEY, {});
  sort: SortState = load<SortState>(SORT_KEY, { field: 'pkid', order: 1 });
  page: PageState = load<PageState>(PAGE_KEY, { first: 0, rows: 20 });

  ngOnInit() {
    this.fetch();
  }

  get hasFilters(): boolean {
    const f = this.filters;
    return !!f.keyword || f.isDraft != null || f.isPublished != null || f.isDiscontinued != null;
  }

  fetch() {
    this.loading.set(true);
    this.service.query(this.filters).subscribe({
      next: (statuses) => {
        this.statuses.set(statuses);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入發布狀態失敗' });
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
    this.router.navigate(['/publish-statuses', 'new']);
  }

  view(status: PublishStatus) {
    this.router.navigate(['/publish-statuses', status.pkid]);
  }

  edit(status: PublishStatus) {
    this.router.navigate(['/publish-statuses', status.pkid, 'edit']);
  }

  remove(status: PublishStatus) {
    this.confirmation.confirm({
      header: '刪除發布狀態',
      message: `確定要刪除主代碼 <b>${status.pkid}</b>「${status.description}」？`,
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonProps: { severity: 'danger' },
      accept: () =>
        this.service.delete(status.pkid).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: '已刪除', detail: status.description });
            this.fetch();
          },
          error: (err: HttpErrorResponse) => {
            const detail =
              err.status === 409 ? '此狀態已被課程或推廣活動使用，無法刪除' : '刪除失敗';
            this.messages.add({ severity: 'error', summary: '錯誤', detail });
          },
        }),
    });
  }
}
