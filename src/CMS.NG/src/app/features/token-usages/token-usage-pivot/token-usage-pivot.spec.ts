import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { TokenUsagePivot as Pivot, TokenUsageReportFilters, TokenUsageTotals } from '../token-usage.model';
import { TokenUsageService } from '../token-usage.service';
import { TokenUsagePivot } from './token-usage-pivot';

function t(cost: number | null, tokenIn: number): TokenUsageTotals {
  return { inputTokens: tokenIn, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 0, outputTokens: 7, tokenIn, cost };
}

/** Helen spends more tokens, Jenny more money. */
const pivot: Pivot = {
  columns: [
    { key: '2026-09', label: '2026-09', title: null, total: t(1, 1000) },
    { key: '2026-10', label: '2026-10', title: null, total: t(5, 50) },
  ],
  rows: [
    { key: 'helen', label: 'Helen Wu', title: 'helen', cells: { '2026-09': t(1, 1000), '2026-10': t(1, 10) }, total: t(2, 1010) },
    { key: 'jenny', label: 'Jenny Lin', title: 'jenny', cells: { '2026-10': t(4, 40) }, total: t(4, 40) },
  ],
  total: t(6, 1050),
};

const filters: TokenUsageReportFilters = { from: '2026-09-01', to: '2026-10-20', userId: null, project: null, model: null };

describe('TokenUsagePivot', () => {
  let fixture: ComponentFixture<TokenUsagePivot>;
  let component: TokenUsagePivot;
  let service: jasmine.SpyObj<TokenUsageService>;

  const el = () => fixture.nativeElement as HTMLElement;
  const rowLabels = () => Array.from(el().querySelectorAll('tbody tr td:first-child')).map((td) => td.textContent!.trim());
  const headers = () => Array.from(el().querySelectorAll('thead th')).map((th) => th.textContent!.trim());

  async function render() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setup(result = of(pivot)) {
    service = jasmine.createSpyObj<TokenUsageService>('TokenUsageService', ['pivot']);
    service.pivot.and.returnValue(result);

    await TestBed.configureTestingModule({
      imports: [TokenUsagePivot],
      providers: [{ provide: TokenUsageService, useValue: service }, provideNoopAnimations(), MessageService],
    }).compileComponents();

    fixture = TestBed.createComponent(TokenUsagePivot);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('filters', filters);
    await render();
  }

  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  describe('default', () => {
    beforeEach(async () => await setup());

    it('queries the filters as users by month', () => {
      expect(service.pivot).toHaveBeenCalledTimes(1);
      expect(service.pivot).toHaveBeenCalledWith({ ...filters, rowDim: 'user', colDim: 'date', dateGrain: 'month' });
    });

    it('renders a cell per (row, column) with row and column totals, cost by default', () => {
      expect(headers()).toEqual(['使用者', '2026-09', '2026-10', '合計']);

      const rows = el().querySelectorAll('tbody tr');
      const cells = (i: number) => Array.from(rows[i].querySelectorAll('td')).map((td) => td.textContent!.trim());
      expect(cells(0)).toEqual(['Jenny Lin', '', '4.00', '4.00']); // no September data: blank, not 0
      expect(cells(1)).toEqual(['Helen Wu', '1.00', '1.00', '2.00']);
      expect(rows[0].querySelector('td')!.getAttribute('title')).toBe('jenny');

      const totals = Array.from(el().querySelectorAll('.totals-row td')).map((td) => td.textContent!.trim());
      expect(totals).toEqual(['合計', '1.00', '5.00', '6.00']);
    });

    it('sorts rows by their total, largest first', () => {
      expect(rowLabels()).toEqual(['Jenny Lin', 'Helen Wu']);
    });

    it('switching the measure re-sorts and re-formats without asking the server', async () => {
      component.setMeasure('tokenIn');
      await render();

      expect(service.pivot).toHaveBeenCalledTimes(1);
      expect(rowLabels()).toEqual(['Helen Wu', 'Jenny Lin']);
      expect(el().querySelector('.totals-row')!.textContent).toContain('1,050');
    });

    it('clicking a column header sorts the rows by it, again reverses, and is remembered', async () => {
      component.setMeasure('tokenIn');
      const header = () => Array.from(el().querySelectorAll<HTMLElement>('thead th')).find((th) => th.textContent!.trim() === '2026-10')!;

      header().click();
      await render();
      expect(rowLabels()).toEqual(['Jenny Lin', 'Helen Wu']); // 40 > 10

      header().click();
      await render();
      expect(rowLabels()).toEqual(['Helen Wu', 'Jenny Lin']);

      expect(JSON.parse(sessionStorage.getItem('tokenusage-pivot-config')!)).toEqual({
        rowDim: 'user', colDim: 'date', dateGrain: 'month', measure: 'tokenIn', sort: { field: '2026-10', order: 1 },
      });
    });

    it('clicking the row header sorts by label', async () => {
      el().querySelector<HTMLElement>('thead th')!.click();
      await render();

      expect(rowLabels()).toEqual(['Helen Wu', 'Jenny Lin']);
    });

    it('row and column options exclude each other, and the column can be 無', () => {
      expect(component.rowOptions().map((o) => o.value)).toEqual(['user', 'project', 'model']);
      expect(component.colOptions().map((o) => o.value)).toEqual([null, 'project', 'model', 'date']);
    });

    it('shows the grain select only while an axis is date', async () => {
      expect(el().querySelector('#p-grain')).not.toBeNull();

      component.setColDim('model');
      await render();

      expect(el().querySelector('#p-grain')).toBeNull();
    });

    it('changing a dimension or the grain re-queries and resets the sort', async () => {
      component.sortBy('2026-10');
      component.setColDim('project');
      await render();
      expect(service.pivot.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ rowDim: 'user', colDim: 'project' }));
      expect(component.sort()).toBeNull();

      component.setColDim('date');
      component.setDateGrain('week');
      await render();
      expect(service.pivot.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ colDim: 'date', dateGrain: 'week' }));
    });

    it('new filters re-query', async () => {
      fixture.componentRef.setInput('filters', { ...filters, project: 'cms' });
      await render();

      expect(service.pivot).toHaveBeenCalledTimes(2);
      expect(service.pivot.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ project: 'cms' }));
    });
  });

  it('without a column dimension shows only the label and total', async () => {
    sessionStorage.setItem('tokenusage-pivot-config', JSON.stringify({ rowDim: 'project', colDim: null }));
    await setup(of({
      columns: [],
      rows: [{ key: 'netprof/cms', label: 'netprof/cms', title: null, cells: {}, total: t(3, 30) }],
      total: t(3, 30),
    }));

    expect(service.pivot).toHaveBeenCalledWith(jasmine.objectContaining({ rowDim: 'project', colDim: null }));
    expect(headers()).toEqual(['專案', '合計']);
    expect(el().querySelector('#p-grain')).toBeNull();
  });

  it('keeps date rows in date order whatever the measure', async () => {
    sessionStorage.setItem('tokenusage-pivot-config', JSON.stringify({ rowDim: 'date', colDim: null, dateGrain: 'week' }));
    await setup(of({
      columns: [],
      rows: [
        { key: '2026-W42', label: '2026-W42', title: '2026-10-12 ~ 2026-10-18', cells: {}, total: t(1, 10) },
        { key: '2026-W43', label: '2026-W43', title: '2026-10-19 ~ 2026-10-25', cells: {}, total: t(9, 90) },
      ],
      total: t(10, 100),
    }));

    expect(rowLabels()).toEqual(['2026-W42', '2026-W43']);
    expect(el().querySelector('tbody td')!.getAttribute('title')).toBe('2026-10-12 ~ 2026-10-18');
  });

  it('orders non-date columns by their total, largest first', async () => {
    sessionStorage.setItem('tokenusage-pivot-config', JSON.stringify({ rowDim: 'user', colDim: 'model' }));
    await setup(of({
      ...pivot,
      columns: [
        { key: 'claude-haiku-5', label: 'claude-haiku-5', title: null, total: t(1, 10) },
        { key: 'claude-opus-5-5', label: 'claude-opus-5-5', title: null, total: t(5, 50) },
      ],
    }));

    expect(headers()).toEqual(['使用者', 'claude-opus-5-5', 'claude-haiku-5', '合計']);
  });

  it('shows an error toast when the pivot fails to load', async () => {
    const add = spyOn(MessageService.prototype, 'add').and.callThrough();
    await setup(throwError(() => new Error('boom')));

    expect(add).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'error' }));
    expect(component.loading()).toBeFalse();
  });
});
