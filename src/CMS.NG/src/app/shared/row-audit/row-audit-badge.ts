import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { RowAuditKeyedRecord, RowAuditRecord } from './row-audit.model';
import { RowAuditService } from './row-audit.service';

type HistoryRow = RowAuditRecord & Partial<Pick<RowAuditKeyedRecord, 'primaryKeyValues'>>;

type HistoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; rows: HistoryRow[] };

/**
 * 異動紀錄 History badge for a page toolbar: shows the latest RowAudit entry inline and opens the
 * full trail (newest first) in a dialog.
 *
 * - One record: set `pkid`. Renders nothing while it is null, e.g. on a New form or before the
 *   record has loaded.
 * - Several records (a page listing many, e.g. FeaturedPromoItem's week): set `pkids` and
 *   optionally `itemLabels`; the dialog adds an 項目 Item column. Always rendered; an empty list
 *   shows the no-history state.
 */
@Component({
  selector: 'app-row-audit-badge',
  imports: [DatePipe, ButtonModule, DialogModule, TableModule, TagModule],
  template: `
    @if (pkid() !== null || multi()) {
      <p-button
        id="row-audit-button"
        severity="secondary"
        size="small"
        [outlined]="true"
        [loading]="state().status === 'loading'"
        (onClick)="open()"
      >
        <span class="badge-content">
          <i class="pi pi-history"></i>
          <span class="badge-label">異動紀錄 History</span>
          <span id="row-audit-latest" class="badge-latest">
            @switch (state().status) {
              @case ('loaded') {
                @if (latest(); as r) {
                  {{ r.actionType }} by {{ r.userName }} · {{ r.dateTime + 'Z' | date: 'yyyy-MM-dd HH:mm' }}
                } @else {
                  尚無紀錄 No history
                }
              }
              @case ('error') { 無法載入 Unavailable }
            }
          </span>
        </span>
      </p-button>

      <p-dialog
        header="異動紀錄 History"
        [(visible)]="dialogVisible"
        [modal]="true"
        [dismissableMask]="true"
        appendTo="body"
        [style]="{ width: '52rem' }"
        [breakpoints]="{ '960px': '95vw' }"
      >
        <p-table id="row-audit-table" [value]="rows()" [scrollable]="true" scrollHeight="60vh" size="small">
          <ng-template #header>
            <tr>
              <th style="width: 10rem">時間 Time</th>
              @if (multi()) { <th style="width: 14rem">項目 Item</th> }
              <th style="width: 9rem">使用者 User</th>
              <th style="width: 6rem">動作 Action</th>
              <th>內容 Detail</th>
            </tr>
          </ng-template>
          <ng-template #body let-r>
            <tr class="row-audit-row">
              <td>{{ r.dateTime + 'Z' | date: 'yyyy-MM-dd HH:mm:ss' }}</td>
              @if (multi()) { <td class="item">{{ itemLabel(r.primaryKeyValues) }}</td> }
              <td>{{ r.userName }}</td>
              <td><p-tag [value]="r.actionType" [severity]="severity(r.actionType)" /></td>
              <td class="desc">{{ r.actionDesc }}</td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr>
              <td [attr.colspan]="multi() ? 5 : 4" id="row-audit-empty" class="empty">尚無異動紀錄 No history yet</td>
            </tr>
          </ng-template>
        </p-table>
      </p-dialog>
    }
  `,
  styles: `
    .badge-content {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    .badge-label {
      font-weight: 600;
    }
    .badge-latest {
      font-size: 0.8rem;
      color: #6b7280;
    }
    .badge-latest:empty {
      display: none;
    }
    .desc,
    .item {
      word-break: break-word;
    }
    .empty {
      text-align: center;
      color: #6b7280;
      padding: 1.5rem;
    }
  `,
})
export class RowAuditBadge {
  private readonly service = inject(RowAuditService);

  /** The database table name, as the API writes it (e.g. `Course`, `FeaturedPromoItem`). */
  readonly tableName = input.required<string>();
  /** The record's key as stored in RowAudit; null hides the badge (single-record mode). */
  readonly pkid = input<string | number | null>(null);
  /** Several records' keys; when set, the badge covers all of them (multi-record mode). */
  readonly pkids = input<(string | number)[] | null>(null);
  /** Multi-record mode: display text per key for the 項目 Item column (e.g. day, slot, topic). */
  readonly itemLabels = input<Record<string, string>>({});

  readonly multi = computed(() => this.pkids() !== null);
  readonly dialogVisible = signal(false);
  readonly state = signal<HistoryState>({ status: 'loading' });
  readonly rows = computed(() => {
    const s = this.state();
    return s.status === 'loaded' ? s.rows : [];
  });
  /** The API returns newest first. */
  readonly latest = computed(() => this.rows()[0] ?? null);

  constructor() {
    const key = computed(() => ({ tableName: this.tableName(), pkid: this.pkid(), pkids: this.pkids() }));
    toObservable(key)
      .pipe(
        switchMap(({ tableName, pkid, pkids }) => {
          if (pkids !== null && pkids.length === 0) return of<HistoryState>({ status: 'loaded', rows: [] });
          if (pkids === null && pkid === null) return of<HistoryState>({ status: 'loading' });
          this.state.set({ status: 'loading' });
          const rows$: Observable<HistoryRow[]> =
            pkids !== null ? this.service.queryHistory(tableName, pkids) : this.service.getHistory(tableName, pkid!);
          return rows$.pipe(
            map((rows): HistoryState => ({ status: 'loaded', rows })),
            catchError(() => of<HistoryState>({ status: 'error' })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((s) => this.state.set(s));
  }

  open() {
    this.dialogVisible.set(true);
  }

  /** `#pkid label`; a deleted item without a label shows its key only. */
  itemLabel(key: string | undefined): string {
    if (key === undefined) return '';
    const label = this.itemLabels()[key];
    return label ? `#${key} ${label}` : `#${key}`;
  }

  severity(actionType: string): 'success' | 'info' | 'danger' | 'secondary' {
    switch (actionType) {
      case 'Insert':
        return 'success';
      case 'Update':
        return 'info';
      case 'Delete':
        return 'danger';
      default:
        return 'secondary';
    }
  }
}
