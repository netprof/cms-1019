import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { FeaturedPromoItemRequest } from './featured-promo-item.model';
import { FeaturedPromoItemService } from './featured-promo-item.service';

describe('FeaturedPromoItemService', () => {
  let service: FeaturedPromoItemService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/featuredpromoitems`;

  const request: FeaturedPromoItemRequest = {
    pkid: 9,
    scheduleOn: '2026-03-16',
    trainingCenterPkid: 1,
    slot: 2,
    promotionPkid: 11,
    topic: 'Google AI工具一次掌握',
    description: '不需技術基礎',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FeaturedPromoItemService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAll() GETs /featuredpromoitems', () => {
    service.getAll().subscribe((r) => expect(r.length).toBe(1));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: 1 }]);
  });

  it('query() POSTs the center and week to /featuredpromoitems/query', () => {
    service.query({ trainingCenterPkid: 1, weekOf: '2026-03-16' }).subscribe();
    const req = http.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ trainingCenterPkid: 1, weekOf: '2026-03-16' });
    req.flush([]);
  });

  it('get() GETs /featuredpromoitems/{id}', () => {
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

  it('update() PUTs to /featuredpromoitems with the key in the body', () => {
    service.update(request).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.pkid).toBe(9);
    req.flush(request);
  });

  it('delete() DELETEs /featuredpromoitems/{id}', () => {
    service.delete(9).subscribe();
    const req = http.expectOne(`${base}/9`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('moveDown() POSTs /featuredpromoitems/{id}/move-down', () => {
    service.moveDown(9).subscribe();
    const req = http.expectOne(`${base}/9/move-down`);
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });

  it('moveUp() POSTs /featuredpromoitems/{id}/move-up', () => {
    service.moveUp(9).subscribe();
    const req = http.expectOne(`${base}/9/move-up`);
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });

  it('getTrainingCenterLookups() GETs /lookups/trainingcenters', () => {
    service.getTrainingCenterLookups().subscribe();
    const req = http.expectOne(`${environment.apiBaseUrl}/lookups/trainingcenters`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('searchPromotions() GETs /lookups/promotions with an encoded keyword', () => {
    service.searchPromotions('AI & n8n').subscribe((r) => expect(r[0].promoCode).toBe('20251215_n8n'));
    const req = http.expectOne((r) => r.url === `${environment.apiBaseUrl}/lookups/promotions`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('keyword')).toBe('AI & n8n');
    expect(req.request.urlWithParams).toContain('keyword=AI%20%26%20n8n');
    req.flush([{ pkid: 12, promoCode: '20251215_n8n', topic: 't', description: 'd' }]);
  });
});
