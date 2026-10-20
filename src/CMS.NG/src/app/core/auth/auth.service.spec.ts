import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { fakeToken, signIn } from '../testing/auth';
import { AUTH_STORAGE_KEY, AuthService, LOGIN_URL } from './auth.service';

describe('AuthService', () => {
  let http: HttpTestingController;

  function create(): AuthService {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('login() POSTs { userId, password } and stores the profile in session storage', () => {
    const service = create();
    const profile = { userId: 'helen', userName: 'Helen', accessToken: fakeToken('Admin') };

    service.login('helen', 'pw').subscribe();
    const req = http.expectOne(LOGIN_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 'helen', password: 'pw' });
    req.flush(profile);

    expect(JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY)!)).toEqual(profile);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(service.profile()).toEqual(profile);
    expect(service.token()).toBe(profile.accessToken);
  });

  it('reads the roles from the token, whether one role or many', () => {
    signIn(['User', 'Admin']);
    expect(create().roles()).toEqual(['User', 'Admin']);
  });

  it('treats a single role claim string as one role', () => {
    signIn('Admin');
    expect(create().isAdmin()).toBeTrue();
  });

  it('is not admin without the Admin role', () => {
    signIn(['User']);
    expect(create().isAdmin()).toBeFalse();
  });

  it('logout() clears session storage and goes to the login page', () => {
    signIn();
    sessionStorage.setItem('course-filters', '{}');
    const service = create();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    service.logout();

    expect(sessionStorage.length).toBe(0);
    expect(service.profile()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: {} });
  });
});
