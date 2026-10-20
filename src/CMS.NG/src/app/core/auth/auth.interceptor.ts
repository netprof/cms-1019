import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { environment } from '@env/environment';
import { AuthService, LOGIN_URL } from './auth.service';

/** Key of the app shell's `<p-toast>` for server errors; the pages' own toasts have no key. */
export const SERVER_ERROR_TOAST_KEY = 'server-error';

/** Shown when a 5xx body has no ProblemDetails `title` (e.g. a proxy's HTML error page). */
export const SERVER_ERROR_FALLBACK = '系統發生未預期的錯誤，請稍後再試';

/**
 * Sends the session token as `Authorization: Bearer` on API requests. A 401 from the API
 * (expired or rejected token) signs the user out; the login call's own 401 is left to the page.
 * A 5xx toasts the API's safe message (ProblemDetails `title`). Every error is re-thrown, so
 * pages still handle 400 field errors, 409s and their own error toasts.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) return next(req);

  const auth = inject(AuthService);
  const router = inject(Router);
  const messages = inject(MessageService);
  const token = auth.token();
  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && req.url !== LOGIN_URL) {
        auth.logout(router.url);
      }
      if (error instanceof HttpErrorResponse && error.status >= 500) {
        const title: unknown = error.error?.title;
        messages.add({
          key: SERVER_ERROR_TOAST_KEY,
          severity: 'error',
          summary: '系統錯誤',
          detail: typeof title === 'string' && title ? title : SERVER_ERROR_FALLBACK,
        });
      }
      return throwError(() => error);
    }),
  );
};
