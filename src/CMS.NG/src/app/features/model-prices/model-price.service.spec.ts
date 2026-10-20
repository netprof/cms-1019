import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { ModelPriceRequest } from './model-price.model';
import { ModelPriceService } from './model-price.service';

describe('ModelPriceService', () => {
  let service: ModelPriceService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/modelprices`;

  const request: ModelPriceRequest = {
    model: 'claude-opus-5-5',
    effectiveDate: '2026-01-01',
    inputPrice: 4,
    cacheWrite5mPrice: 5,
    cacheWrite1hPrice: 8,
    cacheReadPrice: 0.2,
    outputPrice: 20,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ModelPriceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAll() GETs /modelprices', () => {
    service.getAll().subscribe((r) => expect(r.length).toBe(1));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([request]);
  });

  it('query() POSTs the filter to /modelprices/query', () => {
    service.query({ keyword: 'opus', effectiveDateFrom: '2026-01-01' }).subscribe();
    const req = http.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: 'opus', effectiveDateFrom: '2026-01-01' });
    req.flush([]);
  });

  it('get() GETs /modelprices/{model}/{date}', () => {
    service.get('claude-opus-5-5', '2026-01-01').subscribe();
    const req = http.expectOne(`${base}/claude-opus-5-5/2026-01-01`);
    expect(req.request.method).toBe('GET');
    req.flush(request);
  });

  it('get() URL-encodes the model', () => {
    service.get('a/b c', '2026-01-01').subscribe();
    const req = http.expectOne(`${base}/a%2Fb%20c/2026-01-01`);
    req.flush(request);
  });

  it('create() POSTs the request body', () => {
    service.create(request).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(request);
  });

  it('update() PUTs to /modelprices with the key in the body', () => {
    service.update(request).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.model).toBe('claude-opus-5-5');
    expect(req.request.body.effectiveDate).toBe('2026-01-01');
    req.flush(request);
  });

  it('delete() DELETEs /modelprices/{model}/{date} with the model encoded', () => {
    service.delete('a/b', '2026-01-01').subscribe();
    const req = http.expectOne(`${base}/a%2Fb/2026-01-01`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
