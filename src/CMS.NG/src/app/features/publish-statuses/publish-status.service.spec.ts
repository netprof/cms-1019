import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { PublishStatusRequest } from './publish-status.model';
import { PublishStatusService } from './publish-status.service';

describe('PublishStatusService', () => {
  let service: PublishStatusService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/publishstatuses`;

  const request: PublishStatusRequest = {
    pkid: 9,
    description: '審核中',
    isDraft: true,
    isPublished: false,
    isDiscontinued: false,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PublishStatusService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAll() GETs /publishstatuses', () => {
    service.getAll().subscribe((r) => expect(r.length).toBe(1));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: 1 }]);
  });

  it('query() POSTs the filter to /publishstatuses/query', () => {
    service.query({ keyword: '草稿', isPublished: false }).subscribe();
    const req = http.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: '草稿', isPublished: false });
    req.flush([]);
  });

  it('get() GETs /publishstatuses/{id}', () => {
    service.get(2).subscribe();
    const req = http.expectOne(`${base}/2`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('create() POSTs the request body', () => {
    service.create(request).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(request);
  });

  it('update() PUTs to /publishstatuses with the key in the body', () => {
    service.update(request).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.pkid).toBe(9);
    req.flush(request);
  });

  it('delete() DELETEs /publishstatuses/{id}', () => {
    service.delete(9).subscribe();
    const req = http.expectOne(`${base}/9`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getLookups() GETs /lookups/publishstatuses', () => {
    service.getLookups().subscribe();
    const req = http.expectOne(`${environment.apiBaseUrl}/lookups/publishstatuses`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
