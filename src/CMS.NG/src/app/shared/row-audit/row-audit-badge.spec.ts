import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Subject, of, throwError } from 'rxjs';
import { RowAuditKeyedRecord, RowAuditRecord } from './row-audit.model';
import { RowAuditBadge } from './row-audit-badge';
import { RowAuditService } from './row-audit.service';

describe('RowAuditBadge', () => {
  let service: jasmine.SpyObj<RowAuditService>;

  // Newest first, as the API returns them. UTC 06:30 → 14:30 in Asia/Taipei; the specs format in
  // the browser's zone, so compare with the same conversion instead of a fixed string.
  const history: RowAuditRecord[] = [
    { dateTime: '2026-06-04T06:30:00', userName: 'alice', actionType: 'Update', actionDesc: 'Title,Hour' },
    { dateTime: '2026-06-02T01:00:00', userName: 'carol', actionType: 'Update', actionDesc: 'Note' },
    { dateTime: '2026-06-01T01:00:00', userName: 'bob', actionType: 'Insert', actionDesc: 'Angular 入門' },
  ];

  const local = (utc: string) => {
    const d = new Date(utc + 'Z');
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  async function setup(pkid: string | number | null, rows = of(history)): Promise<ComponentFixture<RowAuditBadge>> {
    service = jasmine.createSpyObj<RowAuditService>('RowAuditService', ['getHistory']);
    service.getHistory.and.returnValue(rows);

    TestBed.configureTestingModule({
      imports: [RowAuditBadge],
      providers: [{ provide: RowAuditService, useValue: service }, provideNoopAnimations()],
    });
    const fixture = TestBed.createComponent(RowAuditBadge);
    fixture.componentRef.setInput('tableName', 'Course');
    fixture.componentRef.setInput('pkid', pkid);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: ComponentFixture<RowAuditBadge>) => fixture.nativeElement as HTMLElement;
  const latestText = (fixture: ComponentFixture<RowAuditBadge>) =>
    el(fixture).querySelector('#row-audit-latest')?.textContent?.replace(/\s+/g, ' ').trim();

  async function openDialog(fixture: ComponentFixture<RowAuditBadge>) {
    el(fixture).querySelector<HTMLButtonElement>('#row-audit-button button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // The dialog is appended to <body>.
  const dialogRows = () => Array.from(document.body.querySelectorAll<HTMLTableRowElement>('#row-audit-table tr.row-audit-row'));

  afterEach(() => document.body.querySelectorAll('.p-dialog-mask').forEach((m) => m.remove()));

  it('fetches this record\'s history by table name and pkid', async () => {
    await setup(123);

    expect(service.getHistory).toHaveBeenCalledOnceWith('Course', 123);
  });

  it('shows the bilingual label and the latest record inline', async () => {
    const fixture = await setup(123);

    expect(el(fixture).querySelector('#row-audit-button')!.textContent).toContain('異動紀錄 History');
    expect(latestText(fixture)).toBe(`Update by alice · ${local('2026-06-04T06:30:00')}`);
  });

  it('opens a dialog with the full trail, newest first', async () => {
    const fixture = await setup(123);

    await openDialog(fixture);

    const rows = dialogRows();
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.cells[1].textContent!.trim())).toEqual(['alice', 'carol', 'bob']);
    expect(rows.map((r) => r.cells[3].textContent!.trim())).toEqual(['Title,Hour', 'Note', 'Angular 入門']);
    expect(rows[2].cells[2].textContent).toContain('Insert');
    expect(rows[0].cells[0].textContent).toContain(local('2026-06-04T06:30:00'));
  });

  it('shows the no-history state inline and in the dialog when there are no rows', async () => {
    const fixture = await setup(7, of([]));

    expect(latestText(fixture)).toBe('尚無紀錄 No history');

    await openDialog(fixture);
    expect(dialogRows().length).toBe(0);
    expect(document.body.querySelector('#row-audit-empty')!.textContent).toContain('尚無異動紀錄 No history yet');
  });

  it('renders nothing and fetches nothing without a pkid', async () => {
    const fixture = await setup(null);

    expect(el(fixture).querySelector('#row-audit-button')).toBeNull();
    expect(service.getHistory).not.toHaveBeenCalled();
  });

  it('shows the loading state until the history arrives', async () => {
    const pending = new Subject<RowAuditRecord[]>();
    const fixture = await setup(123, pending);

    expect(latestText(fixture)).toBe('');

    pending.next(history);
    pending.complete();
    fixture.detectChanges();
    expect(latestText(fixture)).toContain('Update by alice');
  });

  it('shows an unavailable state when the request fails', async () => {
    const fixture = await setup(123, throwError(() => new Error('500')));

    expect(latestText(fixture)).toBe('無法載入 Unavailable');
  });

  describe('several records (pkids)', () => {
    const keyed: RowAuditKeyedRecord[] = [
      { dateTime: '2026-06-05T01:10:00', userName: 'bob', actionType: 'Delete', actionDesc: '已刪除', primaryKeyValues: '9' },
      { dateTime: '2026-06-04T06:30:00', userName: 'alice', actionType: 'Update', actionDesc: 'Topic', primaryKeyValues: '5' },
    ];

    async function setupMulti(pkids: number[], rows = of(keyed)) {
      service = jasmine.createSpyObj<RowAuditService>('RowAuditService', ['getHistory', 'queryHistory']);
      service.queryHistory.and.returnValue(rows);
      TestBed.configureTestingModule({
        imports: [RowAuditBadge],
        providers: [{ provide: RowAuditService, useValue: service }, provideNoopAnimations()],
      });
      const fixture = TestBed.createComponent(RowAuditBadge);
      fixture.componentRef.setInput('tableName', 'FeaturedPromoItem');
      fixture.componentRef.setInput('pkids', pkids);
      fixture.componentRef.setInput('itemLabels', { '5': '2026-03-16 #2 Topic A' });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    }

    it('queries all keys and shows the latest change of any of them inline', async () => {
      const fixture = await setupMulti([5, 9]);

      expect(service.queryHistory).toHaveBeenCalledOnceWith('FeaturedPromoItem', [5, 9]);
      expect(service.getHistory).not.toHaveBeenCalled();
      expect(latestText(fixture)).toBe(`Delete by bob · ${local('2026-06-05T01:10:00')}`);
    });

    it('adds an Item column labelled per key; an unlabelled (deleted) key shows its pkid', async () => {
      const fixture = await setupMulti([5, 9]);

      await openDialog(fixture);

      expect(document.body.querySelector('#row-audit-table th:nth-child(2)')!.textContent).toContain('項目 Item');
      expect(dialogRows().map((r) => r.cells[1].textContent!.trim())).toEqual(['#9', '#5 2026-03-16 #2 Topic A']);
    });

    it('shows the badge with no history for an empty list, without a request', async () => {
      const fixture = await setupMulti([]);

      expect(service.queryHistory).not.toHaveBeenCalled();
      expect(el(fixture).querySelector('#row-audit-button')).not.toBeNull();
      expect(latestText(fixture)).toBe('尚無紀錄 No history');
    });
  });

  it('reloads when the pkid changes', async () => {
    const fixture = await setup(123);

    fixture.componentRef.setInput('pkid', 'claude-x,2026-01-01');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(service.getHistory).toHaveBeenCalledWith('Course', 'claude-x,2026-01-01');
  });
});
