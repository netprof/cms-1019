import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { RowAuditService } from './row-audit.service';

describe('RowAuditService', () => {
  let service: RowAuditService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/rowaudit`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RowAuditService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getHistory() GETs /rowaudit with tableName and pkid', () => {
    service.getHistory('Course', 123).subscribe((r) => expect(r.length).toBe(1));
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('tableName')).toBe('Course');
    expect(req.request.params.get('pkid')).toBe('123');
    req.flush([{ dateTime: '2026-06-04T06:30:00', userName: 'alice', actionType: 'Update', actionDesc: 'Title' }]);
  });

  it('queryHistory() POSTs the table name and keys (as strings) to /rowaudit/query', () => {
    service.queryHistory('FeaturedPromoItem', [5, 9]).subscribe();
    const req = http.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ tableName: 'FeaturedPromoItem', pkids: ['5', '9'] });
    req.flush([]);
  });

  it('getHistory() passes a composite key as is', () => {
    service.getHistory('ModelPrice', 'claude-x,2026-01-01').subscribe();
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('pkid')).toBe('claude-x,2026-01-01');
    req.flush([]);
  });
});
