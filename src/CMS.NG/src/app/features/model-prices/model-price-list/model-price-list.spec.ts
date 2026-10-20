import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ModelPrice } from '../model-price.model';
import { ModelPriceService } from '../model-price.service';
import { ModelPriceList } from './model-price-list';

const prices: ModelPrice[] = [
  {
    model: 'claude-haiku-5-5', effectiveDate: '2026-01-01',
    inputPrice: 0.1, cacheWrite5mPrice: 0.125, cacheWrite1hPrice: 0.2, cacheReadPrice: 0.01, outputPrice: 0.5,
  },
  {
    model: 'claude-opus-5-5', effectiveDate: '2026-01-01',
    inputPrice: 4, cacheWrite5mPrice: 5, cacheWrite1hPrice: 8, cacheReadPrice: 0.2, outputPrice: 20,
  },
];

describe('ModelPriceList', () => {
  let fixture: ComponentFixture<ModelPriceList>;
  let component: ModelPriceList;
  let service: jasmine.SpyObj<ModelPriceService>;
  let confirmation: ConfirmationService;
  let messages: MessageService;

  beforeEach(async () => {
    sessionStorage.clear();
    service = jasmine.createSpyObj<ModelPriceService>('ModelPriceService', ['query', 'delete']);
    service.query.and.returnValue(of(prices));
    service.delete.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [ModelPriceList],
      providers: [
        { provide: ModelPriceService, useValue: service },
        provideRouter([]),
        provideNoopAnimations(),
        ConfirmationService,
        MessageService,
      ],
    }).compileComponents();

    confirmation = TestBed.inject(ConfirmationService);
    messages = TestBed.inject(MessageService);
    fixture = TestBed.createComponent(ModelPriceList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => sessionStorage.clear());

  it('loads and renders the prices, including sub-cent rates', () => {
    expect(service.query).toHaveBeenCalledWith({});
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('claude-haiku-5-5');
    expect(rows[0].textContent).toContain('0.125');
    expect(rows[0].textContent).toContain('0.01');
    expect(rows[1].textContent).toContain('claude-opus-5-5');
    expect(rows[1].textContent).toContain('20.00');
  });

  it('defaults to sorting by model ascending', () => {
    expect(component.sort).toEqual({ field: 'model', order: 1 });
  });

  it('applyFilters() sends the date range as ISO strings and persists the filters', () => {
    component.filters = { keyword: 'opus' };
    component.dates = { effectiveDateFrom: new Date(2026, 0, 1), effectiveDateTo: new Date(2026, 5, 30) };

    component.applyFilters();

    const expected = { keyword: 'opus', effectiveDateFrom: '2026-01-01', effectiveDateTo: '2026-06-30' };
    expect(service.query).toHaveBeenCalledWith(expected);
    expect(JSON.parse(sessionStorage.getItem('modelprice-list-filters')!)).toEqual(expected);
    expect(component.hasFilters).toBeTrue();
  });

  it('clearFilters() resets the filters and dates and reloads', () => {
    component.filters = { keyword: 'opus' };
    component.dates = { effectiveDateFrom: new Date(2026, 0, 1), effectiveDateTo: null };

    component.clearFilters();

    expect(service.query).toHaveBeenCalledWith({ effectiveDateFrom: null, effectiveDateTo: null });
    expect(component.dates).toEqual({ effectiveDateFrom: null, effectiveDateTo: null });
    expect(component.hasFilters).toBeFalse();
  });

  it('remembers sort and page in sessionStorage', () => {
    component.onSort({ field: 'effectiveDate', order: -1 });
    component.onPage({ first: 20, rows: 10 });

    expect(JSON.parse(sessionStorage.getItem('modelprice-list-sort')!)).toEqual({ field: 'effectiveDate', order: -1 });
    expect(JSON.parse(sessionStorage.getItem('modelprice-list-page')!)).toEqual({ first: 20, rows: 10 });
  });

  it('restores filters and dates from sessionStorage', () => {
    sessionStorage.setItem('modelprice-list-filters', JSON.stringify({ keyword: 'saved', effectiveDateFrom: '2026-02-03' }));
    const restored = TestBed.createComponent(ModelPriceList).componentInstance;

    expect(restored.filters.keyword).toBe('saved');
    expect(restored.dates.effectiveDateFrom).toEqual(new Date(2026, 1, 3));
  });

  it('navigates to add / view / edit by the composite key', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    component.add();
    component.view(prices[0]);
    component.edit(prices[1]);

    expect(navigate.calls.allArgs()).toEqual([
      [['/model-prices', 'new']],
      [['/model-prices', 'claude-haiku-5-5', '2026-01-01']],
      [['/model-prices', 'claude-opus-5-5', '2026-01-01', 'edit']],
    ]);
  });

  it('remove() asks for confirmation naming the model and effective date', () => {
    const confirm = spyOn(confirmation, 'confirm');

    component.remove(prices[1]);

    const options = confirm.calls.mostRecent().args[0];
    expect(options.message).toContain('<b>claude-opus-5-5</b>');
    expect(options.message).toContain('<b>2026-01-01</b>');
  });

  it('remove() deletes by the composite key after confirmation and reloads', () => {
    spyOn(confirmation, 'confirm').and.callFake((c) => {
      c.accept?.();
      return confirmation;
    });
    service.query.calls.reset();

    component.remove(prices[1]);

    expect(service.delete).toHaveBeenCalledWith('claude-opus-5-5', '2026-01-01');
    expect(service.query).toHaveBeenCalledTimes(1);
  });

  it('remove() shows an error toast when the delete fails', () => {
    spyOn(confirmation, 'confirm').and.callFake((c) => {
      c.accept?.();
      return confirmation;
    });
    service.delete.and.returnValue(throwError(() => new Error('boom')));
    const add = spyOn(messages, 'add');

    component.remove(prices[1]);

    expect(add).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'error', detail: '刪除失敗' }));
  });

  it('remove() does nothing when the confirmation is not accepted', () => {
    spyOn(confirmation, 'confirm');

    component.remove(prices[1]);

    expect(service.delete).not.toHaveBeenCalled();
  });
});
