import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { signIn } from '../testing/auth';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  const run = (url: string) =>
    TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  });
  afterEach(() => sessionStorage.clear());

  it('redirects to the login page, keeping the requested URL, when there is no token', () => {
    const result = run('/courses/5');

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fcourses%2F5');
  });

  it('lets the navigation through when session storage holds a token', () => {
    signIn();

    expect(run('/courses')).toBeTrue();
  });
});
