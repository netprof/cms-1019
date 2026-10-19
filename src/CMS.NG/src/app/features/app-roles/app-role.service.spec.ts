import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { AppRoleRequest } from './app-role.model';
import { AppRoleService } from './app-role.service';

describe('AppRoleService', () => {
  let service: AppRoleService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/approles`;

  const request: AppRoleRequest = {
    roleId: 'Editor',
    roleName: 'Editor',
    permissionLevel: 50,
    description: 'Can edit',
    userIds: ['u1'],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AppRoleService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAll() GETs /approles', () => {
    service.getAll().subscribe((r) => expect(r.length).toBe(1));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([{ roleId: 'Admin' }]);
  });

  it('query() POSTs the filter to /approles/query', () => {
    service.query({ keyword: 'adm', minPermissionLevel: 1 }).subscribe();
    const req = http.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: 'adm', minPermissionLevel: 1 });
    req.flush([]);
  });

  it('get() GETs /approles/{id} with the id URL-encoded', () => {
    service.get('a/b c').subscribe();
    const req = http.expectOne(`${base}/a%2Fb%20c`);
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

  it('update() PUTs to /approles with the key in the body', () => {
    service.update(request).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.roleId).toBe('Editor');
    req.flush(request);
  });

  it('delete() DELETEs /approles/{id}', () => {
    service.delete('Editor').subscribe();
    const req = http.expectOne(`${base}/Editor`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getUserLookups() GETs /lookups/appusers', () => {
    service.getUserLookups().subscribe();
    const req = http.expectOne(`${environment.apiBaseUrl}/lookups/appusers`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
