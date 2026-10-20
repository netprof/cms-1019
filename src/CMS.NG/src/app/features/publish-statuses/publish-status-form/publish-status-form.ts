import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { PublishStatusRequest } from '../publish-status.model';
import { PublishStatusService } from '../publish-status.service';
import { RowAuditBadge } from '@app/shared/row-audit/row-audit-badge';

@Component({
  selector: 'app-publish-status-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    InputNumberModule,
    InputTextModule,
    ToastModule,
    RowAuditBadge,
  ],
  templateUrl: './publish-status-form.html',
  styles: `
    .checks {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  `,
})
export class PublishStatusForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(PublishStatusService);
  private readonly messages = inject(MessageService);

  private readonly idParam = this.route.snapshot.paramMap.get('id');
  readonly pkid = this.idParam !== null ? Number(this.idParam) : null;
  readonly isEdit = this.pkid !== null;
  readonly saving = signal(false);
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    pkid: [null as number | null, [Validators.required, Validators.min(0), Validators.max(255)]],
    description: ['', [Validators.required, Validators.maxLength(50)]],
    isDraft: [false],
    isPublished: [false],
    isDiscontinued: [false],
  });

  ngOnInit() {
    if (!this.isEdit) return;

    this.form.controls.pkid.disable();
    this.service.get(this.pkid!).subscribe({
      next: (status) => {
        this.form.patchValue({
          pkid: status.pkid,
          description: status.description,
          isDraft: status.isDraft,
          isPublished: status.isPublished,
          isDiscontinued: status.isDiscontinued,
        });
      },
      error: () => {
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入資料失敗' });
      },
    });
  }

  invalid(name: 'pkid' | 'description'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  save() {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const request: PublishStatusRequest = {
      pkid: value.pkid!,
      description: value.description.trim(),
      isDraft: value.isDraft,
      isPublished: value.isPublished,
      isDiscontinued: value.isDiscontinued,
    };

    this.saving.set(true);
    const call = this.isEdit ? this.service.update(request) : this.service.create(request);
    call.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/publish-statuses']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const detail =
          err.status === 409 ? `主代碼「${request.pkid}」已存在` : '儲存失敗，請稍後再試';
        this.messages.add({ severity: 'error', summary: '錯誤', detail });
      },
    });
  }

  cancel() {
    this.router.navigate(['/publish-statuses']);
  }
}
