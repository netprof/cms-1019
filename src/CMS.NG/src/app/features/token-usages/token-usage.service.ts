import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { AppUserLookup, TokenUsageReport, TokenUsageReportQuery } from './token-usage.model';

/** Read-only: the report. Ingest (POST /tokenusages) is called by the SessionEnd hook, never by the UI. */
@Injectable({ providedIn: 'root' })
export class TokenUsageService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/tokenusages`;

  report(query: TokenUsageReportQuery): Observable<TokenUsageReport> {
    return this.http.post<TokenUsageReport>(`${this.url}/report`, query);
  }

  getUserLookups(): Observable<AppUserLookup[]> {
    return this.http.get<AppUserLookup[]>(`${environment.apiBaseUrl}/lookups/appusers`);
  }
}
