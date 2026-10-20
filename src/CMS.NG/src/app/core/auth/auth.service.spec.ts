import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { fakeToken, signIn } from '../testing/auth';
import { AUTH_STORAGE_KEY, AuthService, LOGIN_URL, PROFILE_URL } from './auth.service';

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

  it('updateProfile() PUTs the UserName and refreshes only the name in storage and the signal', () => {
    const before = signIn(['Admin'], 'Helen');
    const service = create();

    service.updateProfile('Helen Wang').subscribe();
    const req = http.expectOne(PROFILE_URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ userName: 'Helen Wang' });
    req.flush({ userId: 'helen', userName: 'Helen Wang' });

    const expected = { ...before, userName: 'Helen Wang' };
    expect(JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY)!)).toEqual(expected);
    expect(service.profile()).toEqual(expected);
    expect(service.roles()).toEqual(['Admin']);
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
