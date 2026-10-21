import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { TokenUsageService } from './token-usage.service';

describe('TokenUsageService', () => {
  let service: TokenUsageService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TokenUsageService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('report() POSTs the query to /tokenusages/report', () => {
    const query = { from: '2026-10-01', to: '2026-10-20', first: 0, rows: 20, sortField: 'usageDate', sortOrder: -1 };
    service.report(query).subscribe((r) => expect(r.totalRecords).toBe(0));

    const req = http.expectOne(`${environment.apiBaseUrl}/tokenusages/report`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(query);
    req.flush({ items: [], totalRecords: 0, totals: {} });
  });

  it('sessionReport() POSTs the query to /tokenusages/report/sessions', () => {
    const query = { sessionName: 'login', first: 0, rows: 20, sortField: 'lastDate', sortOrder: -1 };
    service.sessionReport(query).subscribe((r) => expect(r.totalRecords).toBe(0));

    const req = http.expectOne(`${environment.apiBaseUrl}/tokenusages/report/sessions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(query);
    req.flush({ items: [], totalRecords: 0, totals: {} });
  });

  it('getUserLookups() GETs /lookups/appusers', () => {
    service.getUserLookups().subscribe((r) => expect(r.length).toBe(1));

    const req = http.expectOne(`${environment.apiBaseUrl}/lookups/appusers`);
    expect(req.request.method).toBe('GET');
    req.flush([{ userId: 'helen', userName: 'Helen' }]);
  });
});
