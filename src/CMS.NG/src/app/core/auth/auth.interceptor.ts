import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '@env/environment';
import { AuthService, LOGIN_URL } from './auth.service';

/**
 * Sends the session token as `Authorization: Bearer` on API requests. A 401 from the API
 * (expired or rejected token) signs the user out; the login call's own 401 is left to the page.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) return next(req);

  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && req.url !== LOGIN_URL) {
        auth.logout(router.url);
      }
      return throwError(() => error);
    }),
  );
};
