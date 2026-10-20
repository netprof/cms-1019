import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { AppRoleLookup, AppUser, AppUserQuery, AppUserRequest } from './app-user.model';

@Injectable({ providedIn: 'root' })
export class AppUserService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/appusers`;

  getAll(): Observable<AppUser[]> {
    return this.http.get<AppUser[]>(this.url);
  }

  query(query: AppUserQuery): Observable<AppUser[]> {
    return this.http.post<AppUser[]>(`${this.url}/query`, query);
  }

  get(id: string): Observable<AppUser> {
    return this.http.get<AppUser>(`${this.url}/${encodeURIComponent(id)}`);
  }

  create(request: AppUserRequest): Observable<AppUser> {
    return this.http.post<AppUser>(this.url, request);
  }

  update(request: AppUserRequest): Observable<AppUser> {
    return this.http.put<AppUser>(this.url, request);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(id)}`);
  }

  /**
   * Admin only (the API answers 403 otherwise): resets the user's password to the SysConfig
   * default. Only the UserId is sent; no password or hash comes back (204).
   */
  resetPassword(userId: string): Observable<void> {
    return this.http.post<void>(`${environment.apiBaseUrl}/auth/reset-password`, { userId });
  }

  getRoleLookups(): Observable<AppRoleLookup[]> {
    return this.http.get<AppRoleLookup[]>(`${environment.apiBaseUrl}/lookups/approles`);
  }
}
