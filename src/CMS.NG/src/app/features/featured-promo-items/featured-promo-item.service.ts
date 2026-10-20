import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import {
  FeaturedPromoItem,
  FeaturedPromoItemQuery,
  FeaturedPromoItemRequest,
  PromotionLookup,
  TrainingCenterLookup,
} from './featured-promo-item.model';

@Injectable({ providedIn: 'root' })
export class FeaturedPromoItemService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/featuredpromoitems`;

  getAll(): Observable<FeaturedPromoItem[]> {
    return this.http.get<FeaturedPromoItem[]>(this.url);
  }

  query(query: FeaturedPromoItemQuery): Observable<FeaturedPromoItem[]> {
    return this.http.post<FeaturedPromoItem[]>(`${this.url}/query`, query);
  }

  get(id: number): Observable<FeaturedPromoItem> {
    return this.http.get<FeaturedPromoItem>(`${this.url}/${id}`);
  }

  create(request: FeaturedPromoItemRequest): Observable<FeaturedPromoItem> {
    return this.http.post<FeaturedPromoItem>(this.url, request);
  }

  update(request: FeaturedPromoItemRequest): Observable<FeaturedPromoItem> {
    return this.http.put<FeaturedPromoItem>(this.url, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  /** Slot + 1 (e.g. 1 → 2), swapping with the item already there. */
  moveDown(id: number): Observable<void> {
    return this.http.post<void>(`${this.url}/${id}/move-down`, null);
  }

  /** Slot − 1 (e.g. 2 → 1), swapping with the item already there. */
  moveUp(id: number): Observable<void> {
    return this.http.post<void>(`${this.url}/${id}/move-up`, null);
  }

  /** Tabs of the list page (no TrainingCenter feature exists yet). */
  getTrainingCenterLookups(): Observable<TrainingCenterLookup[]> {
    return this.http.get<TrainingCenterLookup[]>(`${environment.apiBaseUrl}/lookups/trainingcenters`);
  }

  /** PromoCode autocomplete: contains-match, newest first, at most 20. */
  searchPromotions(keyword: string): Observable<PromotionLookup[]> {
    return this.http.get<PromotionLookup[]>(`${environment.apiBaseUrl}/lookups/promotions`, {
      params: new HttpParams().set('keyword', keyword),
    });
  }
}
