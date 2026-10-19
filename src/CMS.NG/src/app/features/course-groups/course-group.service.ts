import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { CourseGroup, CourseGroupLookup, CourseGroupQuery, CourseGroupRequest } from './course-group.model';

@Injectable({ providedIn: 'root' })
export class CourseGroupService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/coursegroups`;

  getAll(): Observable<CourseGroup[]> {
    return this.http.get<CourseGroup[]>(this.url);
  }

  query(query: CourseGroupQuery): Observable<CourseGroup[]> {
    return this.http.post<CourseGroup[]>(`${this.url}/query`, query);
  }

  get(id: number): Observable<CourseGroup> {
    return this.http.get<CourseGroup>(`${this.url}/${id}`);
  }

  create(request: CourseGroupRequest): Observable<CourseGroup> {
    return this.http.post<CourseGroup>(this.url, request);
  }

  update(request: CourseGroupRequest): Observable<CourseGroup> {
    return this.http.put<CourseGroup>(this.url, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  /** Slim list for FK dropdowns in other features (Course, PartnerCourseGroup). */
  getLookups(): Observable<CourseGroupLookup[]> {
    return this.http.get<CourseGroupLookup[]>(`${environment.apiBaseUrl}/lookups/coursegroups`);
  }
}
