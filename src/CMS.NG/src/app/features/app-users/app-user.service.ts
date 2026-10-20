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

  /** Resets the password to the system default; the password itself never reaches the client. */
  resetPassword(id: string): Observable<AppUser> {
    return this.http.post<AppUser>(`${this.url}/${encodeURIComponent(id)}/reset-password`, null);
  }

  getRoleLookups(): Observable<AppRoleLookup[]> {
    return this.http.get<AppRoleLookup[]>(`${environment.apiBaseUrl}/lookups/approles`);
  }
}
