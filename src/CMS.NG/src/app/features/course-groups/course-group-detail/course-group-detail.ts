import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { CourseGroup } from '../course-group.model';
import { CourseGroupService } from '../course-group.service';
import { RowAuditBadge } from '@app/shared/row-audit/row-audit-badge';

@Component({
  selector: 'app-course-group-detail',
  imports: [ButtonModule, ToastModule, RowAuditBadge],
  templateUrl: './course-group-detail.html',
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
  `,
})
export class CourseGroupDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CourseGroupService);
  private readonly messages = inject(MessageService);

  readonly group = signal<CourseGroup | null>(null);

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.service.get(id).subscribe({
      next: (group) => this.group.set(group),
      error: () =>
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入課程群組失敗' }),
    });
  }

  edit() {
    this.router.navigate(['/course-groups', this.group()!.pkid, 'edit']);
  }

  /** Primary-Foreign link: courses in this group. */
  viewCourses() {
    this.router.navigate(['/courses'], { queryParams: { courseGroupPkid: this.group()!.pkid } });
  }

  back() {
    this.router.navigate(['/course-groups']);
  }
}
