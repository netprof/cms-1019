import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { CourseGroupRequest } from './course-group.model';
import { CourseGroupService } from './course-group.service';

describe('CourseGroupService', () => {
  let service: CourseGroupService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/coursegroups`;

  const request: CourseGroupRequest = { pkid: 9, description: '線上課程' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CourseGroupService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAll() GETs /coursegroups', () => {
    service.getAll().subscribe((r) => expect(r.length).toBe(1));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: 1 }]);
  });

  it('query() POSTs the filter to /coursegroups/query', () => {
    service.query({ keyword: '進階' }).subscribe();
    const req = http.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: '進階' });
    req.flush([]);
  });

  it('get() GETs /coursegroups/{id}', () => {
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

  it('update() PUTs to /coursegroups with the key in the body', () => {
    service.update(request).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.pkid).toBe(9);
    req.flush(request);
  });

  it('delete() DELETEs /coursegroups/{id}', () => {
    service.delete(9).subscribe();
    const req = http.expectOne(`${base}/9`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getLookups() GETs /lookups/coursegroups', () => {
    service.getLookups().subscribe();
    const req = http.expectOne(`${environment.apiBaseUrl}/lookups/coursegroups`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
