import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { parseIso, toIso } from '../../../core/utils/date.util';
import { ModelPrice, ModelPriceQuery } from '../model-price.model';
import { ModelPriceService } from '../model-price.service';

const FILTERS_KEY = 'modelprice-list-filters';
const SORT_KEY = 'modelprice-list-sort';
const PAGE_KEY = 'modelprice-list-page';

interface SortState {
  field: string;
  order: number;
}

interface PageState {
  first: number;
  rows: number;
}

interface DateFilters {
  effectiveDateFrom: Date | null;
  effectiveDateTo: Date | null;
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
  selector: 'app-model-price-list',
  imports: [
    DecimalPipe,
    FormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    DrawerModule,
    InputTextModule,
    TableModule,
    ToastModule,
  ],
  templateUrl: './model-price-list.html',
})
export class ModelPriceList implements OnInit {
  private readonly service = inject(ModelPriceService);
  private readonly router = inject(Router);
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly prices = signal<ModelPrice[]>([]);
  readonly loading = signal(false);
  readonly drawerVisible = signal(false);

  filters: ModelPriceQuery = load<ModelPriceQuery>(FILTERS_KEY, {});
  sort: SortState = load<SortState>(SORT_KEY, { field: 'model', order: 1 });
  page: PageState = load<PageState>(PAGE_KEY, { first: 0, rows: 20 });

  /** Datepicker models for the date-range filter (`filters` keeps the ISO strings). */
  dates: DateFilters = {
    effectiveDateFrom: parseIso(this.filters.effectiveDateFrom),
    effectiveDateTo: parseIso(this.filters.effectiveDateTo),
  };

  ngOnInit() {
    this.fetch();
  }

  get hasFilters(): boolean {
    const f = this.filters;
    return !!f.keyword || !!f.effectiveDateFrom || !!f.effectiveDateTo;
  }

  fetch() {
    this.loading.set(true);
    this.service.query(this.filters).subscribe({
      next: (prices) => {
        this.prices.set(prices);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入模型價格失敗' });
      },
    });
  }

  applyFilters() {
    this.filters = {
      ...this.filters,
      effectiveDateFrom: toIso(this.dates.effectiveDateFrom),
      effectiveDateTo: toIso(this.dates.effectiveDateTo),
    };
    save(FILTERS_KEY, this.filters);
    this.page = { ...this.page, first: 0 };
    save(PAGE_KEY, this.page);
    this.drawerVisible.set(false);
    this.fetch();
  }

  clearFilters() {
    this.filters = {};
    this.dates = { effectiveDateFrom: null, effectiveDateTo: null };
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
    this.router.navigate(['/model-prices', 'new']);
  }

  view(price: ModelPrice) {
    this.router.navigate(['/model-prices', price.model, price.effectiveDate]);
  }

  edit(price: ModelPrice) {
    this.router.navigate(['/model-prices', price.model, price.effectiveDate, 'edit']);
  }

  remove(price: ModelPrice) {
    this.confirmation.confirm({
      header: '刪除模型價格',
      message: `確定要刪除模型 <b>${price.model}</b> 生效日 <b>${price.effectiveDate}</b> 的價格？`,
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonProps: { severity: 'danger' },
      accept: () =>
        this.service.delete(price.model, price.effectiveDate).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: '已刪除',
              detail: `${price.model} ${price.effectiveDate}`,
            });
            this.fetch();
          },
          error: () => this.messages.add({ severity: 'error', summary: '錯誤', detail: '刪除失敗' }),
        }),
    });
  }
}
