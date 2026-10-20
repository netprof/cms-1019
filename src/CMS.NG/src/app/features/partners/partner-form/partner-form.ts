import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { PartnerRequest } from '../partner.model';
import { PartnerService } from '../partner.service';

type TextField = 'name' | 'appKey' | 'nameOnPartnerMenu' | 'nameOnCourseDetailPage' | 'imageFilename';

@Component({
  selector: 'app-partner-form',
  imports: [ReactiveFormsModule, ButtonModule, InputNumberModule, InputTextModule, ToastModule],
  templateUrl: './partner-form.html',
})
export class PartnerForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(PartnerService);
  private readonly messages = inject(MessageService);

  private readonly idParam = this.route.snapshot.paramMap.get('id');
  /** IDENTITY key — only known in edit mode; shown read-only, never part of the form. */
  readonly pkid = this.idParam !== null ? Number(this.idParam) : null;
  readonly isEdit = this.pkid !== null;
  readonly saving = signal(false);
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(50)]],
    appKey: ['', [Validators.required, Validators.maxLength(10)]],
    nameOnPartnerMenu: ['', [Validators.required, Validators.maxLength(200)]],
    nameOnCourseDetailPage: ['', [Validators.required, Validators.maxLength(50)]],
    displayOrder: [0, [Validators.required]],
    imageFilename: ['', [Validators.maxLength(50)]],
  });

  ngOnInit() {
    if (!this.isEdit) return;

    this.service.get(this.pkid!).subscribe({
      next: (partner) => {
        this.form.patchValue({
          name: partner.name,
          appKey: partner.appKey,
          nameOnPartnerMenu: partner.nameOnPartnerMenu,
          nameOnCourseDetailPage: partner.nameOnCourseDetailPage,
          displayOrder: partner.displayOrder,
          imageFilename: partner.imageFilename ?? '',
        });
      },
      error: () => {
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入資料失敗' });
      },
    });
  }

  invalid(name: TextField | 'displayOrder'): boolean {
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
    const image = value.imageFilename.trim();
    const request: PartnerRequest = {
      pkid: this.pkid ?? 0,
      name: value.name.trim(),
      appKey: value.appKey.trim(),
      nameOnPartnerMenu: value.nameOnPartnerMenu.trim(),
      nameOnCourseDetailPage: value.nameOnCourseDetailPage.trim(),
      displayOrder: value.displayOrder,
      imageFilename: image === '' ? null : image,
    };

    this.saving.set(true);
    const call = this.isEdit ? this.service.update(request) : this.service.create(request);
    call.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/partners']);
      },
      error: () => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '儲存失敗，請稍後再試' });
      },
    });
  }

  cancel() {
    this.router.navigate(['/partners']);
  }
}
