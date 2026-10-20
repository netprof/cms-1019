import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Sends visitors without a session token to the login page, remembering where they were going. */
export const authGuard: CanActivateFn = (_route, state) =>
  inject(AuthService).token()
    ? true
    : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
