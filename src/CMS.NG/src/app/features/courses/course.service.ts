import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import {
  CertificationLookup,
  Course,
  CourseQuery,
  CourseRequest,
  JobCategoryLookup,
} from './course.model';

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/courses`;

  getAll(): Observable<Course[]> {
    return this.http.get<Course[]>(this.url);
  }

  query(query: CourseQuery): Observable<Course[]> {
    return this.http.post<Course[]>(`${this.url}/query`, query);
  }

  get(id: number): Observable<Course> {
    return this.http.get<Course>(`${this.url}/${id}`);
  }

  create(request: CourseRequest): Observable<Course> {
    return this.http.post<Course>(this.url, request);
  }

  update(request: CourseRequest): Observable<Course> {
    return this.http.put<Course>(this.url, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  /** Certification options for the n-n multiselect (no Certification feature exists yet). */
  getCertificationLookups(): Observable<CertificationLookup[]> {
    return this.http.get<CertificationLookup[]>(`${environment.apiBaseUrl}/lookups/certifications`);
  }

  /** Job category options for the n-n multiselect (no JobCategory feature exists yet). */
  getJobCategoryLookups(): Observable<JobCategoryLookup[]> {
    return this.http.get<JobCategoryLookup[]>(`${environment.apiBaseUrl}/lookups/jobcategories`);
  }
}
