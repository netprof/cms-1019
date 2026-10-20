import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { CertificationLookup, Course, JobCategoryLookup } from '../course.model';
import { CourseService } from '../course.service';

@Component({
  selector: 'app-course-detail',
  imports: [DatePipe, DecimalPipe, RouterLink, ButtonModule, TagModule, ToastModule],
  templateUrl: './course-detail.html',
  styles: `
    dl {
      display: grid;
      grid-template-columns: 10rem 1fr;
      gap: 0.75rem 1rem;
      margin: 0;
    }
    dt {
      font-weight: 600;
      color: #6b7280;
    }
    dd {
      margin: 0;
    }
    dd.text {
      white-space: pre-wrap;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
  `,
})
export class CourseDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CourseService);
  private readonly messages = inject(MessageService);

  readonly course = signal<Course | null>(null);
  private readonly certifications = signal<CertificationLookup[]>([]);
  private readonly jobCategories = signal<JobCategoryLookup[]>([]);

  /** Linked certifications resolved to titles. */
  readonly certificationLabels = computed(() => {
    const course = this.course();
    if (!course) return [];
    const byId = new Map(this.certifications().map((c) => [c.pkid, c.title]));
    return course.certificationPkids.map((id) => byId.get(id) ?? String(id));
  });

  /** Linked job categories resolved to descriptions. */
  readonly jobCategoryLabels = computed(() => {
    const course = this.course();
    if (!course) return [];
    const byId = new Map(this.jobCategories().map((j) => [j.pkid, j.description]));
    return course.jobCategoryPkids.map((id) => byId.get(id) ?? String(id));
  });

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    forkJoin({
      course: this.service.get(id),
      certifications: this.service.getCertificationLookups(),
      jobCategories: this.service.getJobCategoryLookups(),
    }).subscribe({
      next: ({ course, certifications, jobCategories }) => {
        this.certifications.set(certifications);
        this.jobCategories.set(jobCategories);
        this.course.set(course);
      },
      error: () =>
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入課程失敗' }),
    });
  }

  edit() {
    this.router.navigate(['/courses', this.course()!.pkid, 'edit']);
  }

  back() {
    this.router.navigate(['/courses']);
  }
}
