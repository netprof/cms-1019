import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { CourseRequest } from './course.model';
import { CourseService } from './course.service';

describe('CourseService', () => {
  let service: CourseService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/courses`;

  const request: CourseRequest = {
    pkid: 9,
    title: 'SQL Server 管理',
    officialTitle: null,
    courseId: 'SQL01',
    prodCourseId: 'SQL-ADMIN',
    friendlyUrl: 'sql-server-admin',
    displayOrder: 1,
    partnerPkid: 1,
    courseGroupPkid: null,
    publishStatusPkid: 1,
    scheduleOn: '2026-09-01',
    scheduleOff: '2036-09-01',
    hour: 24,
    listPrice: 18000,
    learningCredit: 36.5,
    material: null,
    objective: null,
    target: null,
    prerequisites: null,
    outline: null,
    towardCertOrExam: null,
    note: null,
    otherInfo: null,
    canRepeat: false,
    certificationPkids: [100],
    jobCategoryPkids: [5],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CourseService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAll() GETs /courses', () => {
    service.getAll().subscribe((r) => expect(r.length).toBe(1));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: 1 }]);
  });

  it('query() POSTs the filter to /courses/query', () => {
    service.query({ keyword: 'azure', partnerPkid: 1 }).subscribe();
    const req = http.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: 'azure', partnerPkid: 1 });
    req.flush([]);
  });

  it('get() GETs /courses/{id}', () => {
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

  it('update() PUTs to /courses with the key in the body', () => {
    service.update(request).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.pkid).toBe(9);
    req.flush(request);
  });

  it('delete() DELETEs /courses/{id}', () => {
    service.delete(9).subscribe();
    const req = http.expectOne(`${base}/9`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getCertificationLookups() GETs /lookups/certifications', () => {
    service.getCertificationLookups().subscribe();
    const req = http.expectOne(`${environment.apiBaseUrl}/lookups/certifications`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getJobCategoryLookups() GETs /lookups/jobcategories', () => {
    service.getJobCategoryLookups().subscribe();
    const req = http.expectOne(`${environment.apiBaseUrl}/lookups/jobcategories`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
