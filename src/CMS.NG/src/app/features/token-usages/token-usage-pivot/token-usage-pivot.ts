import { Component, WritableSignal, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EMPTY, catchError, finalize, switchMap, tap } from 'rxjs';
import { MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import {
  DateGrain,
  PivotDimension,
  TokenUsagePivot as Pivot,
  TokenUsagePivotQuery,
  TokenUsagePivotRow,
  TokenUsageReportFilters,
  TokenUsageTotals,
} from '../token-usage.model';
import { TokenUsageService } from '../token-usage.service';
import { loadSession, saveSession } from '../../../core/utils/session-storage.util';

/** A token sum or the cost: what each pivot cell shows. */
export type PivotMeasure = keyof TokenUsageTotals;

/** Sort by the row label, the row total, or a column (its key). */
export const LABEL = '$label';
export const TOTAL = '$total';

interface PivotSort {
  field: string;
  order: number;
}

interface PivotConfig {
  rowDim: PivotDimension;
  colDim: PivotDimension | null;
  dateGrain: DateGrain;
  measure: PivotMeasure;
  /** null: rows by total, largest first (by date when the rows are dates). */
  sort: PivotSort | null;
}

const CONFIG_KEY = 'tokenusage-pivot-config';

const DEFAULT_CONFIG: PivotConfig = { rowDim: 'user', colDim: 'date', dateGrain: 'month', measure: 'cost', sort: null };

const DIMENSIONS: { label: string; value: PivotDimension }[] = [
  { label: '使用者', value: 'user' },
  { label: '專案', value: 'project' },
  { label: '模型', value: 'model' },
  { label: '日期', value: 'date' },
];

function loadConfig(): PivotConfig {
  return { ...DEFAULT_CONFIG, ...loadSession<Partial<PivotConfig>>(CONFIG_KEY, {}) };
}

/** Ascending (1) or descending (-1); missing cells and unpriced cost sort last either way. */
function compareValues(a: number | null | undefined, b: number | null | undefined, order: number): number {
  if (a == null || b == null) return Number(a == null) - Number(b == null);
  return order * (a - b);
}

/**
 * 樞紐 mode of the Token Usage report: the filtered usage crossed by a row and an optional column
 * dimension. The server returns every measure per cell, so switching the measure or the sort stays
 * on the client; dimensions, grain and filters re-query.
 */
@Component({
  selector: 'app-token-usage-pivot',
  imports: [DecimalPipe, FormsModule, NgTemplateOutlet, SelectModule, TableModule],
  templateUrl: './token-usage-pivot.html',
  styles: `
    .pivot-config {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 0.75rem;
      margin-bottom: 1rem;

      .field {
        margin-bottom: 0;
        min-width: 10rem;
      }
    }

    .num,
    .nowrap {
      white-space: nowrap;
    }

    .num {
      text-align: right;
    }

    .sortable {
      cursor: pointer;
      white-space: nowrap;
    }

    .totals-row td,
    .total-col {
      font-weight: 600;
    }
  `,
})
export class TokenUsagePivot {
  private readonly service = inject(TokenUsageService);
  private readonly messages = inject(MessageService);

  readonly filters = input.required<TokenUsageReportFilters>();

  readonly LABEL = LABEL;
  readonly TOTAL = TOTAL;

  private readonly saved = loadConfig();
  readonly rowDim = signal<PivotDimension>(this.saved.rowDim);
  readonly colDim = signal<PivotDimension | null>(this.saved.colDim);
  readonly dateGrain = signal<DateGrain>(this.saved.dateGrain);
  readonly measure = signal<PivotMeasure>(this.saved.measure);
  readonly sort = signal<PivotSort | null>(this.saved.sort);

  readonly pivot = signal<Pivot | null>(null);
  readonly loading = signal(false);

  readonly measureOptions: { label: string; value: PivotMeasure }[] = [
    { label: '費用 (USD)', value: 'cost' },
    { label: 'Token In', value: 'tokenIn' },
    { label: 'Input', value: 'inputTokens' },
    { label: 'Cache Write 5m', value: 'cacheWrite5mTokens' },
    { label: 'Cache Write 1h', value: 'cacheWrite1hTokens' },
    { label: 'Cache Read', value: 'cacheReadTokens' },
    { label: 'Output', value: 'outputTokens' },
  ];

  readonly grainOptions: { label: string; value: DateGrain }[] = [
    { label: '日', value: 'day' },
    { label: '週', value: 'week' },
    { label: '月', value: 'month' },
  ];

  readonly rowOptions = computed(() => DIMENSIONS.filter((d) => d.value !== this.colDim()));

  readonly colOptions = computed<{ label: string; value: PivotDimension | null }[]>(() => [
    { label: '無', value: null },
    ...DIMENSIONS.filter((d) => d.value !== this.rowDim()),
  ]);

  readonly usesDate = computed(() => this.rowDim() === 'date' || this.colDim() === 'date');

  readonly rowDimLabel = computed(() => DIMENSIONS.find((d) => d.value === this.rowDim())!.label);

  private readonly query = computed<TokenUsagePivotQuery>(() => ({
    ...this.filters(),
    rowDim: this.rowDim(),
    colDim: this.colDim(),
    dateGrain: this.dateGrain(),
  }));

  /** Dates in time order, other columns by their total, largest first. */
  readonly columns = computed(() => {
    const columns = this.pivot()?.columns ?? [];
    if (this.colDim() === 'date') return columns;
    const m = this.measure();
    return [...columns].sort((a, b) => compareValues(a.total[m], b.total[m], -1));
  });

  /** The chosen sort, else dates in time order (ISO labels sort as text), else by total, largest first. */
  readonly effectiveSort = computed<PivotSort>(
    () => this.sort() ?? (this.rowDim() === 'date' ? { field: LABEL, order: 1 } : { field: TOTAL, order: -1 }),
  );

  readonly rows = computed(() => {
    const { field, order } = this.effectiveSort();
    const m = this.measure();
    const value = (r: TokenUsagePivotRow) => (field === TOTAL ? r.total : r.cells[field])?.[m];
    return [...(this.pivot()?.rows ?? [])].sort((a, b) =>
      field === LABEL ? order * a.label.localeCompare(b.label) : compareValues(value(a), value(b), order),
    );
  });

  constructor() {
    toObservable(this.query)
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap((query) =>
          this.service.pivot(query).pipe(
            catchError(() => {
              this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入樞紐分析失敗' });
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((pivot) => this.pivot.set(pivot));

    effect(() => {
      const config: PivotConfig = {
        rowDim: this.rowDim(),
        colDim: this.colDim(),
        dateGrain: this.dateGrain(),
        measure: this.measure(),
        sort: this.sort(),
      };
      saveSession(CONFIG_KEY, config);
    });
  }

  setRowDim(dim: PivotDimension) {
    this.setAxis(this.rowDim, dim);
  }

  setColDim(dim: PivotDimension | null) {
    this.setAxis(this.colDim, dim);
  }

  setDateGrain(grain: DateGrain) {
    this.setAxis(this.dateGrain, grain);
  }

  /** Changes an axis setting; the sort resets, as the old axes' column keys and labels no longer apply. */
  private setAxis<T>(setting: WritableSignal<T>, value: T) {
    setting.set(value);
    this.sort.set(null);
  }

  setMeasure(measure: PivotMeasure) {
    this.measure.set(measure);
  }

  /** The same field again reverses; a new field starts A→Z for labels, largest first for numbers. */
  sortBy(field: string) {
    const current = this.sort();
    this.sort.set(
      current?.field === field ? { field, order: -current.order } : { field, order: field === LABEL ? 1 : -1 },
    );
  }

  /** The header's sort icon; the default sort shows too. */
  sortIcon(field: string): string {
    const sort = this.effectiveSort();
    if (sort.field !== field) return 'pi pi-sort-alt';
    return sort.order === 1 ? 'pi pi-sort-amount-up-alt' : 'pi pi-sort-amount-down';
  }

  /** The chosen measure of a cell or total; null for a missing cell or unpriced cost. */
  value(totals: TokenUsageTotals | undefined): number | null {
    return totals?.[this.measure()] ?? null;
  }
}
