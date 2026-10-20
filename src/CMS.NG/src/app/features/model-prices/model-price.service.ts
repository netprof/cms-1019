import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { ModelPrice, ModelPriceQuery, ModelPriceRequest } from './model-price.model';

@Injectable({ providedIn: 'root' })
export class ModelPriceService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/modelprices`;

  /** Composite-key URL: `/modelprices/{model}/{yyyy-MM-dd}`. */
  private keyUrl(model: string, effectiveDate: string): string {
    return `${this.url}/${encodeURIComponent(model)}/${encodeURIComponent(effectiveDate)}`;
  }

  getAll(): Observable<ModelPrice[]> {
    return this.http.get<ModelPrice[]>(this.url);
  }

  query(query: ModelPriceQuery): Observable<ModelPrice[]> {
    return this.http.post<ModelPrice[]>(`${this.url}/query`, query);
  }

  get(model: string, effectiveDate: string): Observable<ModelPrice> {
    return this.http.get<ModelPrice>(this.keyUrl(model, effectiveDate));
  }

  create(request: ModelPriceRequest): Observable<ModelPrice> {
    return this.http.post<ModelPrice>(this.url, request);
  }

  update(request: ModelPriceRequest): Observable<ModelPrice> {
    return this.http.put<ModelPrice>(this.url, request);
  }

  delete(model: string, effectiveDate: string): Observable<void> {
    return this.http.delete<void>(this.keyUrl(model, effectiveDate));
  }
}
