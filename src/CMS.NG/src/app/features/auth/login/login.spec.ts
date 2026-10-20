import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AUTH_STORAGE_KEY, LOGIN_URL } from '@app/core/auth/auth.service';
import { fakeToken } from '@app/core/testing/auth';
import { Login } from './login';

describe('Login', () => {
  let http: HttpTestingController;
  let navigateByUrl: jasmine.Spy;

  function setup(returnUrl: string | null = null) {
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) } },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigateByUrl = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('posts the credentials, stores the profile and goes to the return URL', () => {
    const fixture = setup('/courses/5');
    fixture.componentInstance.form.setValue({ userId: ' helen ', password: 'pw' });

    fixture.componentInstance.submit();
    const req = http.expectOne(LOGIN_URL);
    expect(req.request.body).toEqual({ userId: 'helen', password: 'pw' });
    req.flush({ userId: 'helen', userName: 'Helen', accessToken: fakeToken('Admin') });

    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).not.toBeNull();
    expect(navigateByUrl).toHaveBeenCalledWith('/courses/5');
  });

  it('ignores a return URL that leaves the app', () => {
    const fixture = setup('//evil.example.com');
    fixture.componentInstance.form.setValue({ userId: 'helen', password: 'pw' });

    fixture.componentInstance.submit();
    http.expectOne(LOGIN_URL).flush({ userId: 'helen', userName: 'Helen', accessToken: fakeToken('Admin') });

    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('shows a generic error on 401 and stays on the page', () => {
    const fixture = setup();
    fixture.componentInstance.form.setValue({ userId: 'helen', password: 'wrong' });

    fixture.componentInstance.submit();
    http.expectOne(LOGIN_URL).flush({ message: 'invalid credentials' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('#login-error')?.textContent).toContain('帳號或密碼錯誤');
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('does not post when a field is empty', () => {
    const fixture = setup();

    fixture.componentInstance.submit();
    fixture.detectChanges();

    http.expectNone(LOGIN_URL);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('請輸入帳號');
  });
});
