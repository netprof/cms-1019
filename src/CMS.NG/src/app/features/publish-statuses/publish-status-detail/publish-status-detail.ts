import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { PublishStatus } from '../publish-status.model';
import { PublishStatusService } from '../publish-status.service';
import { RowAuditBadge } from '@app/shared/row-audit/row-audit-badge';

@Component({
  selector: 'app-publish-status-detail',
  imports: [ButtonModule, TagModule, ToastModule, RowAuditBadge],
  templateUrl: './publish-status-detail.html',
  styles: `
    dl {
      display: grid;
      grid-template-columns: 8rem 1fr;
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
export class PublishStatusDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(PublishStatusService);
  private readonly messages = inject(MessageService);

  readonly status = signal<PublishStatus | null>(null);

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.service.get(id).subscribe({
      next: (status) => this.status.set(status),
      error: () =>
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入發布狀態失敗' }),
    });
  }

  edit() {
    this.router.navigate(['/publish-statuses', this.status()!.pkid, 'edit']);
  }

  /** Primary-Foreign link: courses with this publish status. */
  viewCourses() {
    this.router.navigate(['/courses'], { queryParams: { publishStatusPkid: this.status()!.pkid } });
  }

  back() {
    this.router.navigate(['/publish-statuses']);
  }
}
