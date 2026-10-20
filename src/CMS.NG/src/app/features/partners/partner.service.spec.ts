import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { PartnerRequest } from './partner.model';
import { PartnerService } from './partner.service';

describe('PartnerService', () => {
  let service: PartnerService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/partners`;

  const request: PartnerRequest = {
    pkid: 9,
    name: 'VMware',
    appKey: 'vmw',
    nameOnPartnerMenu: 'VMware 虛擬化',
    nameOnCourseDetailPage: 'VMware',
    displayOrder: 9,
    imageFilename: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PartnerService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAll() GETs /partners', () => {
    service.getAll().subscribe((r) => expect(r.length).toBe(1));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: 1 }]);
  });

  it('query() POSTs the filter to /partners/query', () => {
    service.query({ keyword: 'cisco' }).subscribe();
    const req = http.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: 'cisco' });
    req.flush([]);
  });

  it('get() GETs /partners/{id}', () => {
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

  it('update() PUTs to /partners with the key in the body', () => {
    service.update(request).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.pkid).toBe(9);
    req.flush(request);
  });

  it('delete() DELETEs /partners/{id}', () => {
    service.delete(9).subscribe();
    const req = http.expectOne(`${base}/9`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getLookups() GETs /lookups/partners', () => {
    service.getLookups().subscribe();
    const req = http.expectOne(`${environment.apiBaseUrl}/lookups/partners`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
