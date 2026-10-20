import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { Partner } from '../partner.model';
import { PartnerService } from '../partner.service';

@Component({
  selector: 'app-partner-detail',
  imports: [ButtonModule, ToastModule],
  templateUrl: './partner-detail.html',
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
export class PartnerDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(PartnerService);
  private readonly messages = inject(MessageService);

  readonly partner = signal<Partner | null>(null);

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.service.get(id).subscribe({
      next: (partner) => this.partner.set(partner),
      error: () =>
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入合作廠商失敗' }),
    });
  }

  edit() {
    this.router.navigate(['/partners', this.partner()!.pkid, 'edit']);
  }

  /** Primary-Foreign link: courses of this partner. */
  viewCourses() {
    this.router.navigate(['/courses'], { queryParams: { partnerPkid: this.partner()!.pkid } });
  }

  back() {
    this.router.navigate(['/partners']);
  }
}
