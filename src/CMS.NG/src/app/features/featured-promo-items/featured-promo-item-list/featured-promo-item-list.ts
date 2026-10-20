import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TabsModule } from 'primeng/tabs';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { addDays, mondayOf, parseIso, toIso } from '../../../core/utils/date.util';
import { FeaturedPromoItemForm } from '../featured-promo-item-form/featured-promo-item-form';
import {
  FeaturedPromoItem,
  FeaturedPromoItemClip,
  SLOTS,
  TrainingCenterLookup,
} from '../featured-promo-item.model';
import { FeaturedPromoItemService } from '../featured-promo-item.service';

const FILTERS_KEY = 'featuredpromoitem-list-filters';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** Saved tab and week (ISO Monday). */
interface Filters {
  trainingCenterPkid: number | null;
  weekOf: string | null;
}

export interface SlotRow {
  slot: number;
  item: FeaturedPromoItem | null;
}

export interface DayRow {
  /** ISO yyyy-MM-dd */
  iso: string;
  /** e.g. `3/16 (一)` */
  label: string;
  slots: SlotRow[];
}

/** The slot whose row is replaced by the inline form. */
interface EditTarget {
  iso: string;
  slot: number;
  item: FeaturedPromoItem | null;
  preset: FeaturedPromoItemClip | null;
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

function shortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

@Component({
  selector: 'app-featured-promo-item-list',
  imports: [
    ButtonModule,
    ConfirmDialogModule,
    TabsModule,
    ToastModule,
    TooltipModule,
    FeaturedPromoItemForm,
  ],
  templateUrl: './featured-promo-item-list.html',
  styles: `
    .week-nav {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      margin: 0.75rem 0 1rem;
      font-weight: 600;
    }
    .day-header {
      background: #eef2f6;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 0.4rem 0.75rem;
      font-weight: 600;
      margin: 0.75rem 0 0.35rem;
    }
    .slot-row {
      display: grid;
      grid-template-columns: 1.5rem 13rem minmax(10rem, 16rem) minmax(12rem, 1fr) minmax(16rem, 2fr);
      gap: 0.5rem;
      align-items: center;
      padding: 0.15rem 0;
    }
    .slot-no {
      text-align: right;
      color: #6b7280;
    }
    .slot-actions {
      display: flex;
      gap: 0.1rem;
    }
    .cell {
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 0.25rem 0.5rem;
      min-height: 1.9rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: #fafafa;
    }
    .editing {
      display: grid;
      grid-template-columns: 1.5rem 1fr;
      gap: 0.5rem;
    }
  `,
})
export class FeaturedPromoItemList implements OnInit {
  private readonly service = inject(FeaturedPromoItemService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly slots = SLOTS;
  readonly trainingCenters = signal<TrainingCenterLookup[]>([]);
  readonly trainingCenterPkid = signal<number | null>(null);
  readonly weekStart = signal<Date>(mondayOf(new Date()));
  readonly items = signal<FeaturedPromoItem[]>([]);
  readonly loading = signal(false);
  readonly editing = signal<EditTarget | null>(null);
  /** Copy buffer; Paste opens a New form pre-filled from it. */
  readonly clip = signal<FeaturedPromoItemClip | null>(null);

  readonly weekLabel = computed(() => {
    const start = this.weekStart();
    return `${start.getFullYear()}  ${shortDate(start)} -- ${shortDate(addDays(start, 6))}`;
  });

  /** Monday–Sunday, each with slots 1–3 filled from `items` (or empty). */
  readonly days = computed<DayRow[]>(() => {
    const start = this.weekStart();
    const items = this.items();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const iso = toIso(date)!;
      return {
        iso,
        label: `${shortDate(date)} (${WEEKDAYS[date.getDay()]})`,
        slots: this.slots.map((slot) => ({
          slot,
          item: items.find((f) => f.scheduleOn.startsWith(iso) && f.slot === slot) ?? null,
        })),
      };
    });
  });

  ngOnInit() {
    const saved = load<Filters>(FILTERS_KEY, { trainingCenterPkid: null, weekOf: null });
    const savedWeek = parseIso(saved.weekOf);
    if (savedWeek) this.weekStart.set(mondayOf(savedWeek));

    this.service.getTrainingCenterLookups().subscribe({
      next: (centers) => {
        this.trainingCenters.set(centers);
        const keep = centers.some((c) => c.pkid === saved.trainingCenterPkid);
        this.trainingCenterPkid.set(keep ? saved.trainingCenterPkid : (centers[0]?.pkid ?? null));
        this.fetch();
      },
      error: () => this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入訓練中心失敗' }),
    });
  }

  fetch() {
    const center = this.trainingCenterPkid();
    if (center === null) return;
    const weekOf = toIso(this.weekStart());
    save(FILTERS_KEY, { trainingCenterPkid: center, weekOf } satisfies Filters);

    this.loading.set(true);
    this.service.query({ trainingCenterPkid: center, weekOf }).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入上稿資料失敗' });
      },
    });
  }

  selectCenter(value: string | number | undefined) {
    const pkid = Number(value);
    if (Number.isNaN(pkid) || pkid === this.trainingCenterPkid()) return;
    this.trainingCenterPkid.set(pkid);
    this.editing.set(null);
    this.fetch();
  }

  shiftWeek(weeks: number) {
    this.weekStart.set(addDays(this.weekStart(), weeks * 7));
    this.editing.set(null);
    this.fetch();
  }

  thisWeek() {
    this.weekStart.set(mondayOf(new Date()));
    this.editing.set(null);
    this.fetch();
  }

  isEditing(day: DayRow, row: SlotRow): boolean {
    const e = this.editing();
    return e !== null && e.iso === day.iso && e.slot === row.slot;
  }

  /** Edit an existing item, or open an empty New form on a free slot. */
  edit(day: DayRow, row: SlotRow) {
    this.editing.set({ iso: day.iso, slot: row.slot, item: row.item, preset: null });
  }

  copy(item: FeaturedPromoItem) {
    this.clip.set({ promotion: item.promotion, topic: item.topic, description: item.description });
    this.messages.add({ severity: 'info', summary: '已複製', detail: item.promotion.promoCode });
  }

  /** New form on a free slot, pre-filled with the copied values. */
  paste(day: DayRow, row: SlotRow) {
    const clip = this.clip();
    if (!clip) return;
    this.editing.set({ iso: day.iso, slot: row.slot, item: null, preset: clip });
  }

  onSaved(item: FeaturedPromoItem) {
    this.editing.set(null);
    this.messages.add({ severity: 'success', summary: '已儲存', detail: item.promotion.promoCode });
    this.fetch();
  }

  onCancelled() {
    this.editing.set(null);
  }

  moveDown(item: FeaturedPromoItem) {
    this.move(item, this.service.moveDown(item.pkid));
  }

  moveUp(item: FeaturedPromoItem) {
    this.move(item, this.service.moveUp(item.pkid));
  }

  private move(item: FeaturedPromoItem, call: ReturnType<FeaturedPromoItemService['moveUp']>) {
    this.editing.set(null);
    call.subscribe({
      next: () => this.fetch(),
      error: () =>
        this.messages.add({ severity: 'error', summary: '錯誤', detail: `無法移動 ${item.promotion.promoCode}` }),
    });
  }

  remove(item: FeaturedPromoItem) {
    this.confirmation.confirm({
      header: '刪除上稿項目',
      message: `確定要刪除 <b>${item.scheduleOn}</b> 第 ${item.slot} 則「${item.promotion.promoCode}」？`,
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonProps: { severity: 'danger' },
      accept: () =>
        this.service.delete(item.pkid).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: '已刪除', detail: item.promotion.promoCode });
            this.fetch();
          },
          error: (err: HttpErrorResponse) => {
            const detail = err.status === 404 ? '此項目已不存在' : '刪除失敗';
            this.messages.add({ severity: 'error', summary: '錯誤', detail });
            this.fetch();
          },
        }),
    });
  }
}
