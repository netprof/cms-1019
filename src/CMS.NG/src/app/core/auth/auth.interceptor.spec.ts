import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { environment } from '@env/environment';
import { signIn } from '../testing/auth';
import { SERVER_ERROR_FALLBACK, SERVER_ERROR_TOAST_KEY, authInterceptor } from './auth.interceptor';
import { AUTH_STORAGE_KEY, AuthService, LOGIN_URL } from './auth.service';

describe('authInterceptor', () => {
  const api = `${environment.apiBaseUrl}/approles`;
  let http: HttpClient;
  let controller: HttpTestingController;
  let router: Router;
  let messages: MessageService;

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        MessageService,
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    messages = TestBed.inject(MessageService);
    spyOn(messages, 'add');
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

  // ---- server errors ----

  it('on a 500 toasts the safe message from the response and still fails the call', () => {
    signIn();
    setup();
    let failed: unknown;

    http.get(api).subscribe({ error: (e) => (failed = e) });
    controller.expectOne(api).flush(
      { status: 500, title: 'An unexpected error occurred.', traceId: '00-abc-01' },
      { status: 500, statusText: 'Internal Server Error' },
    );

    expect(messages.add).toHaveBeenCalledOnceWith({
      key: SERVER_ERROR_TOAST_KEY,
      severity: 'error',
      summary: '系統錯誤',
      detail: 'An unexpected error occurred.',
    });
    expect((failed as HttpErrorResponse).status).toBe(500);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('on a 5xx without a ProblemDetails body toasts the fallback message', () => {
    signIn();
    setup();

    http.get(api).subscribe({ error: () => undefined });
    controller.expectOne(api).flush('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' });

    expect(messages.add).toHaveBeenCalledOnceWith(jasmine.objectContaining({ detail: SERVER_ERROR_FALLBACK }));
  });

  it('on a 401 redirects to the login page without a toast', () => {
    signIn();
    setup();

    http.get(api).subscribe({ error: () => undefined });
    controller.expectOne(api).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(router.navigate).toHaveBeenCalledWith(['/login'], jasmine.anything());
    expect(messages.add).not.toHaveBeenCalled();
  });

  it('passes a 400 validation problem through to the page without a toast', () => {
    signIn();
    setup();
    let failed: unknown;
    const problem = { status: 400, title: 'One or more validation errors occurred.', errors: { Description: ['必填'] } };

    http.post(api, {}).subscribe({ error: (e) => (failed = e) });
    controller.expectOne(api).flush(problem, { status: 400, statusText: 'Bad Request' });

    expect((failed as HttpErrorResponse).error).toEqual(problem);
    expect(messages.add).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
