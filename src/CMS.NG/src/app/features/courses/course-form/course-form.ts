import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { addYears, parseIso, toIso } from '../../../core/utils/date.util';
import { CourseGroupLookup } from '../../course-groups/course-group.model';
import { CourseGroupService } from '../../course-groups/course-group.service';
import { PartnerLookup } from '../../partners/partner.model';
import { PartnerService } from '../../partners/partner.service';
import { PublishStatusLookup } from '../../publish-statuses/publish-status.model';
import { PublishStatusService } from '../../publish-statuses/publish-status.service';
import { CertificationLookup, CourseRequest, JobCategoryLookup } from '../course.model';
import { CourseService } from '../course.service';

/** `scheduleOff` must be on or after `scheduleOn`. */
function scheduleRangeValidator(group: AbstractControl): ValidationErrors | null {
  const on = group.get('scheduleOn')?.value as Date | null;
  const off = group.get('scheduleOff')?.value as Date | null;
  return on && off && off < on ? { dateRange: true } : null;
}

@Component({
  selector: 'app-course-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
    TextareaModule,
    ToastModule,
  ],
  templateUrl: './course-form.html',
  styles: `
    :host ::ng-deep .p-multiselect-label {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
      gap: 0 1.5rem;
    }
    .grid .full {
      grid-column: 1 / -1;
    }
    textarea {
      width: 100%;
      font-family: inherit;
    }
  `,
})
export class CourseForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CourseService);
  private readonly partnerService = inject(PartnerService);
  private readonly courseGroupService = inject(CourseGroupService);
  private readonly publishStatusService = inject(PublishStatusService);
  private readonly messages = inject(MessageService);

  private readonly idParam = this.route.snapshot.paramMap.get('id');
  /** IDENTITY key — only known in edit mode; shown read-only, never part of the form. */
  readonly pkid = this.idParam !== null ? Number(this.idParam) : null;
  readonly isEdit = this.pkid !== null;
  readonly saving = signal(false);
  readonly submitted = signal(false);

  readonly partners = signal<PartnerLookup[]>([]);
  readonly courseGroups = signal<CourseGroupLookup[]>([]);
  readonly publishStatuses = signal<PublishStatusLookup[]>([]);
  readonly certifications = signal<CertificationLookup[]>([]);
  readonly jobCategories = signal<JobCategoryLookup[]>([]);

  /** Set once the user edits 下架日期 themselves; stops the +10-year auto-default. */
  private scheduleOffTouched = false;

  readonly form = this.fb.nonNullable.group(
    {
      title: ['', [Validators.required, Validators.maxLength(200)]],
      officialTitle: ['', [Validators.maxLength(300)]],
      courseId: ['', [Validators.required, Validators.maxLength(50)]],
      prodCourseId: ['', [Validators.required, Validators.maxLength(50)]],
      friendlyUrl: ['', [Validators.required, Validators.maxLength(100)]],
      displayOrder: [0, [Validators.required]],
      partnerPkid: [null as number | null, [Validators.required]],
      courseGroupPkid: [null as number | null],
      publishStatusPkid: [null as number | null, [Validators.required]],
      scheduleOn: [null as Date | null, [Validators.required]],
      scheduleOff: [null as Date | null, [Validators.required]],
      hour: [0, [Validators.required, Validators.min(0)]],
      listPrice: [0, [Validators.required, Validators.min(0)]],
      learningCredit: [0, [Validators.required, Validators.min(0)]],
      canRepeat: [false],
      material: ['', [Validators.maxLength(500)]],
      objective: ['', [Validators.maxLength(4000)]],
      target: ['', [Validators.maxLength(500)]],
      prerequisites: ['', [Validators.maxLength(4000)]],
      outline: [''],
      towardCertOrExam: [''],
      note: ['', [Validators.maxLength(4000)]],
      otherInfo: ['', [Validators.maxLength(4000)]],
      certificationPkids: [[] as number[]],
      jobCategoryPkids: [[] as number[]],
    },
    { validators: scheduleRangeValidator },
  );

  ngOnInit() {
    forkJoin({
      partners: this.partnerService.getLookups(),
      courseGroups: this.courseGroupService.getLookups(),
      publishStatuses: this.publishStatusService.getLookups(),
      certifications: this.service.getCertificationLookups(),
      jobCategories: this.service.getJobCategoryLookups(),
      course: this.isEdit ? this.service.get(this.pkid!) : of(null),
    }).subscribe({
      next: ({ partners, courseGroups, publishStatuses, certifications, jobCategories, course }) => {
        this.partners.set(partners);
        this.courseGroups.set(courseGroups);
        this.publishStatuses.set(publishStatuses);
        this.certifications.set(certifications);
        this.jobCategories.set(jobCategories);
        if (course) {
          this.form.patchValue({
            title: course.title,
            officialTitle: course.officialTitle ?? '',
            courseId: course.courseId,
            prodCourseId: course.prodCourseId,
            friendlyUrl: course.friendlyUrl,
            displayOrder: course.displayOrder,
            partnerPkid: course.partnerPkid,
            courseGroupPkid: course.courseGroupPkid,
            publishStatusPkid: course.publishStatusPkid,
            scheduleOn: parseIso(course.scheduleOn),
            scheduleOff: parseIso(course.scheduleOff),
            hour: course.hour,
            listPrice: course.listPrice,
            learningCredit: course.learningCredit,
            canRepeat: course.canRepeat,
            material: course.material ?? '',
            objective: course.objective ?? '',
            target: course.target ?? '',
            prerequisites: course.prerequisites ?? '',
            outline: course.outline ?? '',
            towardCertOrExam: course.towardCertOrExam ?? '',
            note: course.note ?? '',
            otherInfo: course.otherInfo ?? '',
            certificationPkids: course.certificationPkids,
            jobCategoryPkids: course.jobCategoryPkids,
          });
        }
      },
      error: () => {
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入資料失敗' });
      },
    });

    if (!this.isEdit) {
      // Existing data keeps 下架日期 = 上架日期 + 10 years; default it until the user overrides.
      this.form.controls.scheduleOff.valueChanges.subscribe(() => (this.scheduleOffTouched = true));
      this.form.controls.scheduleOn.valueChanges.subscribe((on) => {
        if (on && !this.scheduleOffTouched) {
          this.form.controls.scheduleOff.setValue(addYears(on, 10), { emitEvent: false });
        }
      });
    }
  }

  invalid(name: keyof CourseForm['form']['controls']): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  get dateRangeInvalid(): boolean {
    const c = this.form.controls.scheduleOff;
    return !!this.form.errors?.['dateRange'] && (c.touched || this.submitted());
  }

  save() {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const optional = (s: string) => (s.trim() === '' ? null : s.trim());
    const request: CourseRequest = {
      pkid: this.pkid ?? 0,
      title: v.title.trim(),
      officialTitle: optional(v.officialTitle),
      courseId: v.courseId.trim(),
      prodCourseId: v.prodCourseId.trim(),
      friendlyUrl: v.friendlyUrl.trim(),
      displayOrder: v.displayOrder,
      partnerPkid: v.partnerPkid!,
      courseGroupPkid: v.courseGroupPkid,
      publishStatusPkid: v.publishStatusPkid!,
      scheduleOn: toIso(v.scheduleOn)!,
      scheduleOff: toIso(v.scheduleOff)!,
      hour: v.hour,
      listPrice: v.listPrice,
      learningCredit: v.learningCredit,
      canRepeat: v.canRepeat,
      material: optional(v.material),
      objective: optional(v.objective),
      target: optional(v.target),
      prerequisites: optional(v.prerequisites),
      outline: optional(v.outline),
      towardCertOrExam: optional(v.towardCertOrExam),
      note: optional(v.note),
      otherInfo: optional(v.otherInfo),
      certificationPkids: v.certificationPkids,
      jobCategoryPkids: v.jobCategoryPkids,
    };

    this.saving.set(true);
    const call = this.isEdit ? this.service.update(request) : this.service.create(request);
    call.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/courses']);
      },
      error: () => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '儲存失敗，請稍後再試' });
      },
    });
  }

  cancel() {
    this.router.navigate(['/courses']);
  }
}
