import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import {
  PublishStatus,
  PublishStatusLookup,
  PublishStatusQuery,
  PublishStatusRequest,
} from './publish-status.model';

@Injectable({ providedIn: 'root' })
export class PublishStatusService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/publishstatuses`;

  getAll(): Observable<PublishStatus[]> {
    return this.http.get<PublishStatus[]>(this.url);
  }

  query(query: PublishStatusQuery): Observable<PublishStatus[]> {
    return this.http.post<PublishStatus[]>(`${this.url}/query`, query);
  }

  get(id: number): Observable<PublishStatus> {
    return this.http.get<PublishStatus>(`${this.url}/${id}`);
  }

  create(request: PublishStatusRequest): Observable<PublishStatus> {
    return this.http.post<PublishStatus>(this.url, request);
  }

  update(request: PublishStatusRequest): Observable<PublishStatus> {
    return this.http.put<PublishStatus>(this.url, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  /** Slim list for FK dropdowns in other features (Course, Promotion2). */
  getLookups(): Observable<PublishStatusLookup[]> {
    return this.http.get<PublishStatusLookup[]>(`${environment.apiBaseUrl}/lookups/publishstatuses`);
  }
}
