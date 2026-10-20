import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '@env/environment';
import { signIn } from '../testing/auth';
import { authInterceptor } from './auth.interceptor';
import { AUTH_STORAGE_KEY, AuthService, LOGIN_URL } from './auth.service';

describe('authInterceptor', () => {
  const api = `${environment.apiBaseUrl}/approles`;
  let http: HttpClient;
  let controller: HttpTestingController;
  let router: Router;

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
  }

  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    controller.verify();
    sessionStorage.clear();
  });

  it('attaches the session token as a Bearer header on API requests', () => {
    const profile = signIn();
    setup();

    http.get(api).subscribe();

    const req = controller.expectOne(api);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${profile.accessToken}`);
    req.flush([]);
  });

  it('reads the token from session storage on every request', () => {
    signIn();
    setup();
    sessionStorage.removeItem(AUTH_STORAGE_KEY);

    http.get(api).subscribe();

    const req = controller.expectOne(api);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush([]);
  });

  it('sends no Authorization header without a token', () => {
    setup();

    http.get(api).subscribe();

    const req = controller.expectOne(api);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush([]);
  });

  it('does not send the token to non-API URLs', () => {
    signIn();
    setup();

    http.get('https://example.com/data.json').subscribe();

    const req = controller.expectOne('https://example.com/data.json');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('on a 401 clears session storage and redirects to the login page', () => {
    signIn();
    sessionStorage.setItem('approle-filters', '{}');
    setup();
    let failed = false;

    http.get(api).subscribe({ error: () => (failed = true) });
    controller.expectOne(api).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBeTrue();
    expect(sessionStorage.length).toBe(0);
    expect(TestBed.inject(AuthService).profile()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], jasmine.anything());
  });

  it('leaves the 401 of the login call itself to the login page', () => {
    setup();
    let failed = false;

    http.post(LOGIN_URL, {}).subscribe({ error: () => (failed = true) });
    controller.expectOne(LOGIN_URL).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not sign out on other errors', () => {
    signIn();
    setup();

    http.get(api).subscribe({ error: () => undefined });
    controller.expectOne(api).flush(null, { status: 500, statusText: 'Server Error' });

    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).not.toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
