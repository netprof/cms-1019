import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { Partner, PartnerLookup, PartnerQuery, PartnerRequest } from './partner.model';

@Injectable({ providedIn: 'root' })
export class PartnerService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/partners`;

  getAll(): Observable<Partner[]> {
    return this.http.get<Partner[]>(this.url);
  }

  query(query: PartnerQuery): Observable<Partner[]> {
    return this.http.post<Partner[]>(`${this.url}/query`, query);
  }

  get(id: number): Observable<Partner> {
    return this.http.get<Partner>(`${this.url}/${id}`);
  }

  create(request: PartnerRequest): Observable<Partner> {
    return this.http.post<Partner>(this.url, request);
  }

  update(request: PartnerRequest): Observable<Partner> {
    return this.http.put<Partner>(this.url, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  /** Slim list for FK dropdowns in other features (Course, Certification, Promotion2, …). */
  getLookups(): Observable<PartnerLookup[]> {
    return this.http.get<PartnerLookup[]>(`${environment.apiBaseUrl}/lookups/partners`);
  }
}
