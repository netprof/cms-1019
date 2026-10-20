import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { RowAuditKeyedRecord, RowAuditRecord } from './row-audit.model';

@Injectable({ providedIn: 'root' })
export class RowAuditService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/rowaudit`;

  /** A record's history, newest first. `pkid` is the key as stored (ModelPrice: `model,yyyy-MM-dd`). */
  getHistory(tableName: string, pkid: string | number): Observable<RowAuditRecord[]> {
    return this.http.get<RowAuditRecord[]>(this.url, { params: { tableName, pkid: String(pkid) } });
  }

  /** The combined history of several records of one table, newest first, each row with its key. */
  queryHistory(tableName: string, pkids: (string | number)[]): Observable<RowAuditKeyedRecord[]> {
    return this.http.post<RowAuditKeyedRecord[]>(`${this.url}/query`, { tableName, pkids: pkids.map(String) });
  }
}
