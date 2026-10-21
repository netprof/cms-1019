import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { TokenUsageReport as Report, TokenUsageSessionReport } from '../token-usage.model';
import { TokenUsageService } from '../token-usage.service';
import { TokenUsageReport } from './token-usage-report';

const report: Report = {
  items: [
    {
      usageDate: '2026-10-20', userId: 'helen', userName: 'Helen Wu', project: 'netprof/cms', model: 'claude-opus-5-5',
      inputTokens: 1200, cacheWrite5mTokens: 30, cacheWrite1hTokens: 40, cacheReadTokens: 500000, outputTokens: 7000,
      tokenIn: 501270, cost: null,
    },
    {
      usageDate: '2026-10-19', userId: 'jenny', userName: 'Jenny Lin', project: 'acme/web', model: 'claude-haiku-5',
      inputTokens: 1, cacheWrite5mTokens: 2, cacheWrite1hTokens: 3, cacheReadTokens: 4, outputTokens: 5,
      tokenIn: 10, cost: 1.25,
    },
  ],
  totalRecords: 42,
  totals: {
    inputTokens: 9001, cacheWrite5mTokens: 32, cacheWrite1hTokens: 43, cacheReadTokens: 500004, outputTokens: 7005,
    tokenIn: 509080, cost: 1.25,
  },
};

const sessionReport: TokenUsageSessionReport = {
  items: [
    {
      sessionId: 'aaaa-1111', sessionName: '修正登入 bug', userId: 'helen', userName: 'Helen Wu', project: 'netprof/cms',
      firstDate: '2026-10-19', lastDate: '2026-10-20', models: 'claude-haiku-5-5, claude-opus-5-5',
      inputTokens: 1200, cacheWrite5mTokens: 30, cacheWrite1hTokens: 40, cacheReadTokens: 500000, outputTokens: 7000,
      tokenIn: 501270, cost: 3.5,
    },
    {
      sessionId: 'bbbb-2222', sessionName: null, userId: 'jenny', userName: 'Jenny Lin', project: 'acme/web',
      firstDate: '2026-10-18', lastDate: '2026-10-18', models: 'claude-opus-5-5',
      inputTokens: 1, cacheWrite5mTokens: 2, cacheWrite1hTokens: 3, cacheReadTokens: 4, outputTokens: 5,
      tokenIn: 10, cost: null,
    },
  ],
  totalRecords: 70,
  totals: {
    inputTokens: 1201, cacheWrite5mTokens: 32, cacheWrite1hTokens: 43, cacheReadTokens: 500004, outputTokens: 7005,
    tokenIn: 501280, cost: 3.5,
  },
};

describe('TokenUsageReport', () => {
  let fixture: ComponentFixture<TokenUsageReport>;
  let component: TokenUsageReport;
  let service: jasmine.SpyObj<TokenUsageService>;
  let messages: MessageService;

  const el = () => fixture.nativeElement as HTMLElement;

  async function setup(result = of(report)) {
    service = jasmine.createSpyObj<TokenUsageService>('TokenUsageService', ['report', 'sessionReport', 'getUserLookups']);
    service.report.and.returnValue(result);
    service.sessionReport.and.returnValue(of(sessionReport));
    service.getUserLookups.and.returnValue(of([{ userId: 'helen', userName: 'Helen Wu' }]));

    await TestBed.configureTestingModule({
      imports: [TokenUsageReport],
      providers: [{ provide: TokenUsageService, useValue: service }, provideNoopAnimations(), MessageService],
    }).compileComponents();

    messages = TestBed.inject(MessageService);
    fixture = TestBed.createComponent(TokenUsageReport);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    sessionStorage.clear();
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(Date.UTC(2026, 9, 20, 1, 30))); // 2026-10-20 09:30 in Taipei
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    sessionStorage.clear();
  });

  describe('default', () => {
    beforeEach(async () => await setup());

    it('queries the 1st of this month through today, newest first, 20 rows', () => {
      expect(service.report).toHaveBeenCalledTimes(1);
      expect(service.report).toHaveBeenCalledWith({
        from: '2026-10-01', to: '2026-10-20', userId: null, project: null, model: null,
        first: 0, rows: 20, sortField: 'usageDate', sortOrder: -1,
      });
      expect(component.dates.from).toEqual(new Date(2026, 9, 1));
      expect(component.dates.to).toEqual(new Date(2026, 9, 20));
    });

    it('renders date, user ID and name, project, model, five token types, Token In and cost', () => {
      const header = el().querySelector('thead')!.textContent!;
      for (const title of ['日期', '使用者', '專案', '模型', 'Input', 'Cache Write 5m', 'Cache Write 1h', 'Cache Read', 'Output', 'Token In', '費用']) {
        expect(header).toContain(title);
      }

      const rows = el().querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);
      const cells = Array.from(rows[0].querySelectorAll('td')).map((td) => td.textContent!.trim());
      expect(cells).toEqual([
        '2026-10-20', 'helen Helen Wu', 'netprof/cms', 'claude-opus-5-5',
        '1,200', '30', '40', '500,000', '7,000', '501,270', '',
      ]);
      expect(rows[1].textContent).toContain('1.25');
    });

    it('shows a totals row for the whole filtered set', () => {
      const totals = el().querySelector('tfoot tr, .totals-row')!;
      expect(totals.textContent).toContain('合計');
      expect(totals.textContent).toContain('9,001');
      expect(totals.textContent).toContain('509,080');
      expect(totals.textContent).toContain('1.25');
    });

    it('pages with the server total', () => {
      expect(el().textContent).toContain('共 42 筆');
    });

    it('has no export or edit actions', () => {
      const text = el().textContent!;
      for (const word of ['匯出', 'Export', '新增', '編輯', '刪除']) expect(text).not.toContain(word);
    });

    it('loads the user lookup for the filter', () => {
      expect(component.userOptions).toEqual([{ userId: 'helen', label: 'Helen Wu (helen)' }]);
    });

    it('applyFilters() queries from the first page and persists the filters', () => {
      component.onLazyLoad({ first: 40, rows: 20, sortField: 'usageDate', sortOrder: -1 });
      component.filters = { ...component.filters, userId: 'helen', project: 'cms', model: 'opus' };
      component.dates = { from: new Date(2026, 8, 5), to: new Date(2026, 8, 30) };
      component.applyFilters();

      const expectedFilters = { from: '2026-09-05', to: '2026-09-30', userId: 'helen', project: 'cms', model: 'opus' };
      expect(service.report.calls.mostRecent().args[0]).toEqual({
        ...expectedFilters, first: 0, rows: 20, sortField: 'usageDate', sortOrder: -1,
      });
      expect(JSON.parse(sessionStorage.getItem('tokenusage-report-filters')!)).toEqual(expectedFilters);
    });

    it('clearFilters() goes back to this month with no other filters', () => {
      component.filters = { userId: 'helen', project: 'cms', model: 'opus' };
      component.dates = { from: null, to: null };
      component.clearFilters();

      expect(service.report.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
        from: '2026-10-01', to: '2026-10-20', userId: null, project: null, model: null,
      }));
    });

    it('sorting and paging re-query the server and are remembered', () => {
      component.onLazyLoad({ first: 20, rows: 50, sortField: 'tokenIn', sortOrder: 1 });

      expect(service.report.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
        first: 20, rows: 50, sortField: 'tokenIn', sortOrder: 1,
      }));
      expect(JSON.parse(sessionStorage.getItem('tokenusage-report-sort')!)).toEqual({ field: 'tokenIn', order: 1 });
      expect(JSON.parse(sessionStorage.getItem('tokenusage-report-page')!)).toEqual({ first: 20, rows: 50 });
    });
  });

  describe('by session', () => {
    /** Clicks the mode toggle's option with this label, then lets the swapped-in table load. */
    async function switchTo(label: string) {
      const option = Array.from(el().querySelectorAll<HTMLElement>('#mode-toggle .p-togglebutton'))
        .find((b) => b.textContent!.trim() === label)!;
      option.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    beforeEach(async () => {
      await setup();
      await switchTo('依 Session');
    });

    it('queries the session report, newest last date first, with an empty session-name filter', () => {
      expect(service.sessionReport).toHaveBeenCalledTimes(1);
      expect(service.sessionReport).toHaveBeenCalledWith({
        from: '2026-10-01', to: '2026-10-20', userId: null, project: null, model: null, sessionName: null,
        first: 0, rows: 20, sortField: 'lastDate', sortOrder: -1,
      });
      expect(sessionStorage.getItem('tokenusage-report-mode')).toBe('"session"');
    });

    it('renders name and ID, date range, user, project, models, tokens and cost per session', () => {
      expect(el().querySelector('#session-table')).not.toBeNull();
      expect(el().querySelector('#summary-table')).toBeNull();
      const rows = el().querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);
      const cells = Array.from(rows[0].querySelectorAll('td')).map((td) => td.textContent!.replace(/\s+/g, ' ').trim());
      expect(cells).toEqual([
        '修正登入 bug aaaa-1111', '2026-10-19 ~ 2026-10-20', 'helen Helen Wu', 'netprof/cms', 'claude-haiku-5-5, claude-opus-5-5',
        '1,200', '30', '40', '500,000', '7,000', '501,270', '3.50',
      ]);
      const second = rows[1].querySelectorAll('td');
      expect(second[0].textContent).toContain('（未命名）');
      expect(second[1].textContent!.trim()).toBe('2026-10-18');
      expect(el().querySelector('.totals-row')!.textContent).toContain('501,280');
      expect(el().textContent).toContain('共 70 筆');
    });

    it('shows the session-name filter only in this mode', async () => {
      expect(el().querySelector('#f-sessionName')).not.toBeNull();

      await switchTo('彙總');

      expect(el().querySelector('#f-sessionName')).toBeNull();
      expect(el().querySelector('#summary-table')).not.toBeNull();
    });

    it('applyFilters() sends the trimmed session name and remembers it apart from the summary filters', () => {
      component.filters = { ...component.filters, sessionName: '  登入 ', project: 'cms' };
      component.applyFilters();

      expect(service.sessionReport.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
        sessionName: '登入', project: 'cms', first: 0,
      }));
      expect(JSON.parse(sessionStorage.getItem('tokenusage-sessions-filters')!)).toEqual({
        userId: null, project: 'cms', model: null, sessionName: '登入',
      });
      expect(sessionStorage.getItem('tokenusage-report-filters')).toBeNull();
    });

    it('each mode keeps its own filters, sort and page', async () => {
      component.filters = { ...component.filters, sessionName: 'login' };
      component.applyFilters();
      component.onLazyLoad({ first: 20, rows: 20, sortField: 'cost', sortOrder: 1 });

      await switchTo('彙總');
      expect(service.report.calls.mostRecent().args[0]).toEqual({
        from: '2026-10-01', to: '2026-10-20', userId: null, project: null, model: null,
        first: 0, rows: 20, sortField: 'usageDate', sortOrder: -1,
      });

      await switchTo('依 Session');
      expect(service.sessionReport.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
        sessionName: 'login', first: 20, sortField: 'cost', sortOrder: 1,
      }));
    });

    it('opens in the remembered mode', async () => {
      TestBed.resetTestingModule();

      await setup();

      expect(component.mode).toBe('session');
      expect(service.report).not.toHaveBeenCalled();
      expect(service.sessionReport).toHaveBeenCalledTimes(1);
    });
  });

  it('defaults "today" to the Taipei (UTC+8) date', async () => {
    jasmine.clock().mockDate(new Date(Date.UTC(2026, 9, 31, 16, 30))); // Oct 31 in UTC, Nov 1 00:30 in Taipei

    await setup();

    expect(service.report.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      from: '2026-11-01', to: '2026-11-01',
    }));
  });

  it('a default range applied yesterday follows today, while the other saved filters stay', async () => {
    await setup();
    component.filters = { ...component.filters, userId: 'helen' };
    component.applyFilters(); // dates still the default 2026-10-01..2026-10-20
    TestBed.resetTestingModule();
    jasmine.clock().mockDate(new Date(Date.UTC(2026, 9, 21, 1, 0))); // next day in Taipei

    await setup();

    expect(service.report.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      from: '2026-10-01', to: '2026-10-21', userId: 'helen',
    }));
  });

  it('a range the user picked survives the next day', async () => {
    await setup();
    component.dates = { from: new Date(2026, 9, 5), to: new Date(2026, 9, 20) };
    component.applyFilters();
    TestBed.resetTestingModule();
    jasmine.clock().mockDate(new Date(Date.UTC(2026, 9, 21, 1, 0)));

    await setup();

    expect(service.report.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      from: '2026-10-05', to: '2026-10-20',
    }));
  });

  it('restores saved filters, sort and page', async () => {
    sessionStorage.setItem('tokenusage-report-filters', JSON.stringify({ from: '2026-01-01', to: '2026-01-31', userId: 'helen' }));
    sessionStorage.setItem('tokenusage-report-sort', JSON.stringify({ field: 'cost', order: 1 }));
    sessionStorage.setItem('tokenusage-report-page', JSON.stringify({ first: 20, rows: 10 }));

    await setup();

    expect(service.report.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      from: '2026-01-01', to: '2026-01-31', userId: 'helen', first: 20, rows: 10, sortField: 'cost', sortOrder: 1,
    }));
    expect(component.dates.from).toEqual(new Date(2026, 0, 1));
  });

  it('shows an error toast when the report fails to load', async () => {
    const add = spyOn(MessageService.prototype, 'add').and.callThrough();
    await setup(throwError(() => new Error('boom')));

    expect(add).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'error' }));
    expect(component.loading()).toBeFalse();
    expect(messages).toBeTruthy();
  });
});
