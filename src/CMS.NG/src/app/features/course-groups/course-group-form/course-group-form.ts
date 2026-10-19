import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { CourseGroupRequest } from '../course-group.model';
import { CourseGroupService } from '../course-group.service';

@Component({
  selector: 'app-course-group-form',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, ToastModule],
  templateUrl: './course-group-form.html',
})
export class CourseGroupForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CourseGroupService);
  private readonly messages = inject(MessageService);

  private readonly idParam = this.route.snapshot.paramMap.get('id');
  /** IDENTITY key — only known in edit mode; shown read-only, never part of the form. */
  readonly pkid = this.idParam !== null ? Number(this.idParam) : null;
  readonly isEdit = this.pkid !== null;
  readonly saving = signal(false);
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(100)]],
  });

  ngOnInit() {
    if (!this.isEdit) return;

    this.service.get(this.pkid!).subscribe({
      next: (group) => this.form.patchValue({ description: group.description }),
      error: () => {
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入資料失敗' });
      },
    });
  }

  invalid(name: 'description'): boolean {
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
    const request: CourseGroupRequest = {
      pkid: this.pkid ?? 0,
      description: value.description.trim(),
    };

    this.saving.set(true);
    const call = this.isEdit ? this.service.update(request) : this.service.create(request);
    call.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/course-groups']);
      },
      error: () => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '儲存失敗，請稍後再試' });
      },
    });
  }

  cancel() {
    this.router.navigate(['/course-groups']);
  }
}
