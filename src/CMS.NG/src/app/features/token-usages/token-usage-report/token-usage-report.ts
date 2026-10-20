import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { parseIso, toIso } from '../../../core/utils/date.util';
import {
  AppUserLookup,
  TokenUsageReport as Report,
  TokenUsageReportFilters,
  TokenUsageReportRow,
  TokenUsageTotals,
} from '../token-usage.model';
import { TokenUsageService } from '../token-usage.service';

const FILTERS_KEY = 'tokenusage-report-filters';
const SORT_KEY = 'tokenusage-report-sort';
const PAGE_KEY = 'tokenusage-report-page';

interface SortState {
  field: string;
  order: number;
}

interface PageState {
  first: number;
  rows: number;
}

/** The subset of PrimeNG's TableLazyLoadEvent this page uses. */
export interface LazyLoad {
  first?: number | null;
  rows?: number | null;
  sortField?: string | string[] | null;
  sortOrder?: number | null;
}

/** Date-range values as `Date` objects for the pickers (ISO strings live in `filters`). */
interface DateFilters {
  from: Date | null;
  to: Date | null;
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

/** The 1st of this month through today (local dates), no other filters. */
function defaultFilters(): TokenUsageReportFilters {
  const today = new Date();
  return {
    from: toIso(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: toIso(today),
    userId: null,
    project: null,
    model: null,
  };
}

const emptyTotals: TokenUsageTotals = {
  inputTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  cacheReadTokens: 0,
  outputTokens: 0,
  tokenIn: 0,
  cost: null,
};

/** Read-only Token Usage report: server-side paged/sorted, with a totals row for the filtered set. */
@Component({
  selector: 'app-token-usage-report',
  imports: [DecimalPipe, FormsModule, ButtonModule, DatePickerModule, InputTextModule, SelectModule, TableModule, ToastModule],
  templateUrl: './token-usage-report.html',
  styles: `
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 0.75rem;

      .field {
        margin-bottom: 0;
        min-width: 10rem;
        flex: 1 1 10rem;
      }

      .actions {
        display: flex;
        gap: 0.5rem;
      }
    }

    .num {
      text-align: right;
      white-space: nowrap;
    }

    .user-name {
      color: #6b7280;
    }

    .totals-row td {
      font-weight: 600;
    }
  `,
})
export class TokenUsageReport implements OnInit {
  private readonly service = inject(TokenUsageService);
  private readonly messages = inject(MessageService);

  readonly rows = signal<TokenUsageReportRow[]>([]);
  readonly totalRecords = signal(0);
  readonly totals = signal<TokenUsageTotals>(emptyTotals);
  readonly loading = signal(false);
  readonly users = signal<AppUserLookup[]>([]);

  filters: TokenUsageReportFilters = load<TokenUsageReportFilters>(FILTERS_KEY, defaultFilters());
  dates: DateFilters = { from: null, to: null };
  sort: SortState = load<SortState>(SORT_KEY, { field: 'usageDate', order: -1 });
  page: PageState = load<PageState>(PAGE_KEY, { first: 0, rows: 20 });

  ngOnInit() {
    this.syncDatesFromFilters();
    // The first fetch comes from the lazy table's initial onLazyLoad.
    this.service.getUserLookups().subscribe({
      next: (users) => this.users.set(users),
      error: () =>
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入使用者選項失敗' }),
    });
  }

  /** User lookup mapped for p-select. */
  get userOptions(): { userId: string; label: string }[] {
    return this.users().map((u) => ({ userId: u.userId, label: `${u.userName} (${u.userId})` }));
  }

  private syncDatesFromFilters() {
    this.dates = { from: parseIso(this.filters.from), to: parseIso(this.filters.to) };
  }

  fetch() {
    this.loading.set(true);
    this.service
      .report({
        ...this.filters,
        first: this.page.first,
        rows: this.page.rows,
        sortField: this.sort.field,
        sortOrder: this.sort.order,
      })
      .subscribe({
        next: (report: Report) => {
          this.rows.set(report.items);
          this.totalRecords.set(report.totalRecords);
          this.totals.set(report.totals);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入用量報表失敗' });
        },
      });
  }

  /** Table sort/page change (and the table's initial load). */
  onLazyLoad(event: LazyLoad) {
    const field = Array.isArray(event.sortField) ? event.sortField[0] : event.sortField;
    this.sort = { field: field || this.sort.field, order: event.sortOrder || this.sort.order };
    this.page = { first: event.first ?? 0, rows: event.rows || this.page.rows };
    save(SORT_KEY, this.sort);
    save(PAGE_KEY, this.page);
    this.fetch();
  }

  applyFilters() {
    const text = (v: string | null | undefined) => v?.trim() || null;
    this.filters = {
      from: toIso(this.dates.from),
      to: toIso(this.dates.to),
      userId: this.filters.userId || null,
      project: text(this.filters.project),
      model: text(this.filters.model),
    };
    save(FILTERS_KEY, this.filters);
    this.page = { ...this.page, first: 0 };
    save(PAGE_KEY, this.page);
    this.fetch();
  }

  clearFilters() {
    this.filters = defaultFilters();
    this.syncDatesFromFilters();
    this.applyFilters();
  }
}
