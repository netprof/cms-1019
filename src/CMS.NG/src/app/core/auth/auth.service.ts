import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '@env/environment';

/** What `POST /api/auth/login` returns; kept in session storage under {@link AUTH_STORAGE_KEY}. */
export interface AuthProfile {
  userId: string;
  userName: string;
  accessToken: string;
}

export const AUTH_STORAGE_KEY = 'cms-auth';
export const LOGIN_URL = `${environment.apiBaseUrl}/auth/login`;
export const PROFILE_URL = `${environment.apiBaseUrl}/auth/profile`;
export const CHANGE_PASSWORD_URL = `${environment.apiBaseUrl}/auth/change-password`;

/** Plain passwords for `POST /api/auth/change-password`; hashes never leave the server. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** Signed-in user for the shell; storage stays the source of truth for the token. */
  readonly profile = signal<AuthProfile | null>(readProfile());

  /** `role` claims of the access token (a string or an array in the JWT). */
  readonly roles = computed(() => rolesOf(this.profile()?.accessToken));
  readonly isAdmin = computed(() => this.roles().includes('Admin'));

  /** Read from session storage on every call, so a cleared storage takes effect immediately. */
  token(): string | null {
    return readProfile()?.accessToken ?? null;
  }

  login(userId: string, password: string): Observable<AuthProfile> {
    return this.http.post<AuthProfile>(LOGIN_URL, { userId, password }).pipe(
      tap((profile) => {
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profile));
        this.profile.set(profile);
      }),
    );
  }

  /**
   * Renames the signed-in user (the API takes the UserId from the token) and refreshes the
   * stored profile, so the shell shows the new name at once. The token itself is unchanged.
   */
  updateProfile(userName: string): Observable<Pick<AuthProfile, 'userId' | 'userName'>> {
    return this.http.put<Pick<AuthProfile, 'userId' | 'userName'>>(PROFILE_URL, { userName }).pipe(
      tap(({ userName: saved }) => {
        const current = this.profile();
        if (!current) return;
        const next = { ...current, userName: saved };
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
        this.profile.set(next);
      }),
    );
  }

  /** Changes the signed-in user's password (UserId from the token). 204 on success, 400 with field errors otherwise. */
  changePassword(request: ChangePasswordRequest): Observable<void> {
    return this.http.post<void>(CHANGE_PASSWORD_URL, request);
  }

  /** Clears all session storage (token and saved list filters) and goes to the login page. */
  logout(returnUrl?: string) {
    sessionStorage.clear();
    this.profile.set(null);
    const queryParams = returnUrl && returnUrl !== '/' ? { returnUrl } : {};
    this.router.navigate(['/login'], { queryParams });
  }
}

function readProfile(): AuthProfile | null {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    const profile = raw ? (JSON.parse(raw) as AuthProfile) : null;
    return profile?.accessToken ? profile : null;
  } catch {
    return null;
  }
}

function rolesOf(token: string | undefined): string[] {
  if (!token) return [];
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    const role = JSON.parse(new TextDecoder().decode(bytes)).role;
    return Array.isArray(role) ? role : typeof role === 'string' ? [role] : [];
  } catch {
    return [];
  }
}
