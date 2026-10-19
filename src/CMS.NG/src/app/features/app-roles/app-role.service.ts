import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { AppRole, AppRoleQuery, AppRoleRequest, AppUserLookup } from './app-role.model';

@Injectable({ providedIn: 'root' })
export class AppRoleService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/approles`;

  getAll(): Observable<AppRole[]> {
    return this.http.get<AppRole[]>(this.url);
  }

  query(query: AppRoleQuery): Observable<AppRole[]> {
    return this.http.post<AppRole[]>(`${this.url}/query`, query);
  }

  get(id: string): Observable<AppRole> {
    return this.http.get<AppRole>(`${this.url}/${encodeURIComponent(id)}`);
  }

  create(request: AppRoleRequest): Observable<AppRole> {
    return this.http.post<AppRole>(this.url, request);
  }

  update(request: AppRoleRequest): Observable<AppRole> {
    return this.http.put<AppRole>(this.url, request);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(id)}`);
  }

  getUserLookups(): Observable<AppUserLookup[]> {
    return this.http.get<AppUserLookup[]>(`${environment.apiBaseUrl}/lookups/appusers`);
  }
}
