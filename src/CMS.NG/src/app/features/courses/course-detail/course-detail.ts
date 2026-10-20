import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import QRCode, { QRCodeToDataURLOptions } from 'qrcode';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { CertificationLookup, Course, JobCategoryLookup } from '../course.model';
import { CourseService } from '../course.service';

/** Options shared by the on-screen QR code and the downloaded image. */
export const QR_OPTIONS: QRCodeToDataURLOptions = { type: 'image/png', width: 200, margin: 2 };

/** Public course page encoded in the QR code. */
export function courseShowUrl(course: Pick<Course, 'pkid' | 'courseId'>): string {
  return `https://www.uuu.com.tw/Course/Show/${course.pkid}/${encodeURIComponent(course.courseId)}`;
}

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
    .basic {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 1.5rem;
    }
    .basic dl {
      flex: 1 1 24rem;
    }
    .qr {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
    }
    .qr figcaption {
      font-weight: 600;
    }
    .qr img {
      width: 200px;
      height: 200px;
      border: 1px solid #e5e7eb;
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

  /** URL encoded in the QR code. */
  readonly qrUrl = computed(() => {
    const course = this.course();
    return course ? courseShowUrl(course) : null;
  });

  /** PNG data URL of the rendered QR code. */
  readonly qrDataUrl = signal<string | null>(null);

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
        this.renderQr();
      },
      error: () =>
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入課程失敗' }),
    });
  }

  private renderQr() {
    QRCode.toDataURL(this.qrUrl()!, QR_OPTIONS).then(
      (dataUrl) => this.qrDataUrl.set(dataUrl),
      () => this.messages.add({ severity: 'error', summary: '錯誤', detail: '產生 QR Code 失敗' }),
    );
  }

  /** Composes the CourseId title above the QR code and returns it as a PNG data URL. */
  async buildQrImage(): Promise<string> {
    const qr = new Image();
    qr.src = this.qrDataUrl()!;
    await qr.decode();

    const titleHeight = 36;
    const canvas = document.createElement('canvas');
    canvas.width = qr.width;
    canvas.height = qr.height + titleHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.font = '600 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.course()!.courseId, canvas.width / 2, titleHeight / 2 + 4, canvas.width - 16);
    ctx.drawImage(qr, 0, titleHeight);
    return canvas.toDataURL('image/png');
  }

  async downloadQr() {
    try {
      const link = document.createElement('a');
      link.href = await this.buildQrImage();
      link.download = `${this.course()!.courseId}.png`;
      link.click();
    } catch {
      this.messages.add({ severity: 'error', summary: '錯誤', detail: '下載 QR Code 失敗' });
    }
  }

  edit() {
    this.router.navigate(['/courses', this.course()!.pkid, 'edit']);
  }

  back() {
    this.router.navigate(['/courses']);
  }
}
