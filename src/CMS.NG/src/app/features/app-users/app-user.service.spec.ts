import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { AppUserRequest } from './app-user.model';
import { AppUserService } from './app-user.service';

describe('AppUserService', () => {
  let service: AppUserService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/appusers`;

  const request: AppUserRequest = {
    userId: 'kevin',
    userName: 'Kevin',
    isActive: true,
    roleIds: ['User'],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AppUserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAll() GETs /appusers', () => {
    service.getAll().subscribe((r) => expect(r.length).toBe(1));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([{ userId: 'helen' }]);
  });

  it('query() POSTs the filter to /appusers/query', () => {
    service.query({ keyword: 'hel', isActive: true, roleId: 'Admin' }).subscribe();
    const req = http.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: 'hel', isActive: true, roleId: 'Admin' });
    req.flush([]);
  });

  it('get() GETs /appusers/{id} with the id URL-encoded', () => {
    service.get('a@b.c/d e').subscribe();
    const req = http.expectOne(`${base}/a%40b.c%2Fd%20e`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('create() POSTs the request body without any password field', () => {
    service.create(request).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    expect(Object.keys(req.request.body)).not.toContain('passwordHash');
    req.flush(request);
  });

  it('update() PUTs to /appusers with the key in the body', () => {
    service.update(request).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.userId).toBe('kevin');
    req.flush(request);
  });

  it('delete() DELETEs /appusers/{id} URL-encoded', () => {
    service.delete('a b').subscribe();
    const req = http.expectOne(`${base}/a%20b`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('resetPassword() POSTs an empty body to /appusers/{id}/reset-password', () => {
    service.resetPassword('a b').subscribe();
    const req = http.expectOne(`${base}/a%20b/reset-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it('getRoleLookups() GETs /lookups/approles', () => {
    service.getRoleLookups().subscribe();
    const req = http.expectOne(`${environment.apiBaseUrl}/lookups/approles`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
