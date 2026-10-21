import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { parseIso, taipeiToday, toIso } from '../../../core/utils/date.util';
import {
  AppUserLookup,
  TokenUsageReport as Report,
  TokenUsageReportFilters,
  TokenUsageReportQuery,
  TokenUsageReportRow,
  TokenUsageSessionRow,
  TokenUsageTotals,
} from '../token-usage.model';
import { TokenUsageService } from '../token-usage.service';
import { TokenUsagePivot } from '../token-usage-pivot/token-usage-pivot';

/** `summary`: by (user, date, project, model); `session`: one row per session; `pivot`: two dimensions crossed. */
export type ReportMode = 'summary' | 'session' | 'pivot';

/** The modes shown as a server-paged table; the pivot keeps its own config and sort. */
type TableMode = Exclude<ReportMode, 'pivot'>;

const MODES: ReportMode[] = ['summary', 'session', 'pivot'];

const MODE_KEY = 'tokenusage-report-mode';

/** Each mode remembers its own filters; the table modes also their sort and page. */
const FILTERS_KEYS: Record<ReportMode, string> = {
  summary: 'tokenusage-report-filters',
  session: 'tokenusage-sessions-filters',
  pivot: 'tokenusage-pivot-filters',
};

const TABLE_KEYS: Record<TableMode, { sort: string; page: string }> = {
  summary: { sort: 'tokenusage-report-sort', page: 'tokenusage-report-page' },
  session: { sort: 'tokenusage-sessions-sort', page: 'tokenusage-sessions-page' },
};

interface SortState {
  field: string;
  order: number;
}

interface PageState {
  first: number;
  rows: number;
}

const DEFAULT_SORT: Record<TableMode, SortState> = {
  summary: { field: 'usageDate', order: -1 },
  session: { field: 'lastDate', order: -1 },
};

const DEFAULT_PAGE: PageState = { first: 0, rows: 20 };

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

/**
 * The 1st of this month through today, in Taipei dates (as `UsageDate` is), no other filters.
 * Only the session mode has a session-name filter.
 */
function defaultFilters(mode: ReportMode): TokenUsageReportFilters {
  const today = taipeiToday();
  return {
    from: toIso(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: toIso(today),
    userId: null,
    project: null,
    model: null,
    ...(mode === 'session' ? { sessionName: null } : {}),
  };
}

/**
 * Saved filters over today's defaults. The date range is saved only when it differs from the
 * default, so an untouched "this month to date" keeps following today after midnight.
 */
function loadFilters(mode: ReportMode): TokenUsageReportFilters {
  return { ...defaultFilters(mode), ...load<Partial<TokenUsageReportFilters>>(FILTERS_KEYS[mode], {}) };
}

function saveFilters(mode: ReportMode, filters: TokenUsageReportFilters) {
  const defaults = defaultFilters(mode);
  const { from, to, ...rest } = filters;
  save(FILTERS_KEYS[mode], from === defaults.from && to === defaults.to ? rest : filters);
}

function loadMode(): ReportMode {
  const mode = load<ReportMode>(MODE_KEY, 'summary');
  return MODES.includes(mode) ? mode : 'summary';
}

function loadSort(mode: TableMode): SortState {
  return load<SortState>(TABLE_KEYS[mode].sort, DEFAULT_SORT[mode]);
}

function loadPage(mode: TableMode): PageState {
  return load<PageState>(TABLE_KEYS[mode].page, DEFAULT_PAGE);
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

/**
 * Read-only Token Usage report: server-side paged/sorted, with a totals row for the filtered set.
 * Shows either the (user, date, project, model) summary or one row per session.
 */
@Component({
  selector: 'app-token-usage-report',
  imports: [
    DecimalPipe,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    InputTextModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    ToastModule,
    TokenUsagePivot,
  ],
  templateUrl: './token-usage-report.html',
  styles: `
    .page-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

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

    .nowrap {
      white-space: nowrap;
    }

    .user-name,
    .muted {
      color: #6b7280;
    }

    .session-id {
      display: block;
      font-size: 0.75rem;
    }

    .totals-row td {
      font-weight: 600;
    }
  `,
})
export class TokenUsageReport implements OnInit {
  private readonly service = inject(TokenUsageService);
  private readonly messages = inject(MessageService);

  readonly modeOptions: { label: string; value: ReportMode }[] = [
    { label: '彙總', value: 'summary' },
    { label: '依 Session', value: 'session' },
    { label: '樞紐', value: 'pivot' },
  ];

  readonly subtitles: Record<ReportMode, string> = {
    summary: '依使用者、日期、專案、模型彙總',
    session: '依 Session 彙總',
    pivot: '樞紐分析',
  };

  readonly rows = signal<TokenUsageReportRow[]>([]);
  readonly sessionRows = signal<TokenUsageSessionRow[]>([]);
  readonly totalRecords = signal(0);
  readonly totals = signal<TokenUsageTotals>(emptyTotals);
  readonly loading = signal(false);
  readonly users = signal<AppUserLookup[]>([]);

  mode: ReportMode = loadMode();
  filters: TokenUsageReportFilters = loadFilters(this.mode);
  dates: DateFilters = { from: null, to: null };
  /** Of the table mode shown; untouched while the pivot is shown. */
  sort: SortState = this.mode === 'pivot' ? DEFAULT_SORT.summary : loadSort(this.mode);
  page: PageState = this.mode === 'pivot' ? DEFAULT_PAGE : loadPage(this.mode);

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

  /**
   * Switches to another report with its own remembered state. The template swaps views; a table's
   * initial onLazyLoad fetches, and the pivot fetches when it gets its filters.
   */
  setMode(mode: ReportMode) {
    if (!mode) return; // p-selectbutton emits null when the selected option is clicked again
    this.mode = mode;
    save(MODE_KEY, mode);
    this.filters = loadFilters(mode);
    this.syncDatesFromFilters();
    if (mode !== 'pivot') {
      this.sort = loadSort(mode);
      this.page = loadPage(mode);
    }
    this.rows.set([]);
    this.sessionRows.set([]);
    this.totalRecords.set(0);
    this.totals.set(emptyTotals);
  }

  fetch() {
    const query: TokenUsageReportQuery = {
      ...this.filters,
      first: this.page.first,
      rows: this.page.rows,
      sortField: this.sort.field,
      sortOrder: this.sort.order,
    };
    const mode = this.mode;
    const request: Observable<Report<TokenUsageReportRow | TokenUsageSessionRow>> =
      mode === 'session' ? this.service.sessionReport(query) : this.service.report(query);

    this.loading.set(true);
    request.subscribe({
      next: (report) => {
        if (mode !== this.mode) return; // switched while loading
        if (mode === 'session') this.sessionRows.set(report.items as TokenUsageSessionRow[]);
        else this.rows.set(report.items as TokenUsageReportRow[]);
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
    const keys = TABLE_KEYS[this.mode as TableMode];
    save(keys.sort, this.sort);
    save(keys.page, this.page);
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
      ...(this.mode === 'session' ? { sessionName: text(this.filters.sessionName) } : {}),
    };
    saveFilters(this.mode, this.filters);
    if (this.mode === 'pivot') return; // the pivot re-queries on its new filters input
    this.page = { ...this.page, first: 0 };
    save(TABLE_KEYS[this.mode].page, this.page);
    this.fetch();
  }

  clearFilters() {
    this.filters = defaultFilters(this.mode);
    this.syncDatesFromFilters();
    this.applyFilters();
  }

  /** `yyyy-MM-dd`, or `first ~ last` for a session spanning several days. */
  dateRange(r: TokenUsageSessionRow): string {
    return r.firstDate === r.lastDate ? r.firstDate : `${r.firstDate} ~ ${r.lastDate}`;
  }
}
