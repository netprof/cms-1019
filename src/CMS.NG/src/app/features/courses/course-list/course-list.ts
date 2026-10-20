import { Component, Injector, OnInit, afterNextRender, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, switchMap } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DrawerModule } from 'primeng/drawer';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { parseIso, toIso } from '../../../core/utils/date.util';
import { CourseGroupLookup } from '../../course-groups/course-group.model';
import { CourseGroupService } from '../../course-groups/course-group.service';
import { PartnerLookup } from '../../partners/partner.model';
import { PartnerService } from '../../partners/partner.service';
import { PublishStatusLookup } from '../../publish-statuses/publish-status.model';
import { PublishStatusService } from '../../publish-statuses/publish-status.service';
import { Course, CourseQuery, CourseRequest } from '../course.model';
import { CourseService } from '../course.service';

const FILTERS_KEY = 'course-list-filters';
const SORT_KEY = 'course-list-sort';
const PAGE_KEY = 'course-list-page';

/** Query params a parent list can pass to pre-filter this list. */
const INCOMING_PARAMS = ['partnerPkid', 'courseGroupPkid', 'publishStatusPkid'] as const;

/** List columns that can be edited in place (主代碼, 原廠 and 課程群組 stay read-only). */
export type EditableField =
  | 'displayOrder'
  | 'courseId'
  | 'prodCourseId'
  | 'title'
  | 'publishStatusPkid'
  | 'scheduleOn'
  | 'scheduleOff'
  | 'hour'
  | 'listPrice'
  | 'learningCredit'
  | 'canRepeat';

/** Max lengths of the editable text columns (mirrors CourseRequest). */
const TEXT_MAX: Partial<Record<EditableField, number>> = { courseId: 50, prodCourseId: 50, title: 200 };

/** Upper bounds of the editable numeric columns (mirrors CourseRequest). */
const NUMBER_MAX: Partial<Record<EditableField, number>> = {
  hour: 32767,
  listPrice: 999_999_999,
  learningCredit: 99_999_999.9,
};

/** The cell being edited in place; `value` is the editor's draft (a `Date` for date columns). */
interface CellEdit {
  pkid: number;
  field: EditableField;
  value: unknown;
  error: string | null;
}

/** Id given to the single open cell editor so it can be focused once rendered. */
const CELL_EDITOR_ID = 'cell-editor';

interface SortState {
  field: string;
  order: number;
}

interface PageState {
  first: number;
  rows: number;
}

/** Date-range filter values as `Date` objects for the pickers (ISO strings live in `filters`). */
interface DateFilters {
  scheduleOnFrom: Date | null;
  scheduleOnTo: Date | null;
  scheduleOffFrom: Date | null;
  scheduleOffTo: Date | null;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable; state simply isn't remembered
  }
}

@Component({
  selector: 'app-course-list',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    ButtonModule,
    CheckboxModule,
    ConfirmDialogModule,
    DatePickerModule,
    DrawerModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
  ],
  templateUrl: './course-list.html',
  styles: `
    td.editable {
      cursor: cell;
    }
    td.editable:hover {
      background: var(--p-content-hover-background);
    }
    td.cell-editing {
      padding: 0.25rem;
    }
    .cell-error {
      display: block;
      color: var(--p-red-500);
      font-size: 0.75rem;
      white-space: normal;
    }
  `,
})
export class CourseList implements OnInit {
  private readonly service = inject(CourseService);
  private readonly partnerService = inject(PartnerService);
  private readonly courseGroupService = inject(CourseGroupService);
  private readonly publishStatusService = inject(PublishStatusService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);
  private readonly injector = inject(Injector);

  readonly cellEditorId = CELL_EDITOR_ID;

  readonly courses = signal<Course[]>([]);
  readonly loading = signal(false);
  readonly drawerVisible = signal(false);
  readonly partners = signal<PartnerLookup[]>([]);
  readonly courseGroups = signal<CourseGroupLookup[]>([]);
  readonly publishStatuses = signal<PublishStatusLookup[]>([]);
  /** Rows whose in-place edit is being saved; they can't be edited again until it settles. */
  readonly savingPkids = signal<ReadonlySet<number>>(new Set());

  /** The open in-place cell editor, if any. */
  cellEdit: CellEdit | null = null;

  /** Tri-state options for the CanRepeat filter (clearing the select = no filter). */
  readonly boolOptions = [
    { label: '是', value: true },
    { label: '否', value: false },
  ];

  filters: CourseQuery = load<CourseQuery>(FILTERS_KEY, {});
  dates: DateFilters = { scheduleOnFrom: null, scheduleOnTo: null, scheduleOffFrom: null, scheduleOffTo: null };
  sort: SortState = load<SortState>(SORT_KEY, { field: 'displayOrder', order: 1 });
  page: PageState = load<PageState>(PAGE_KEY, { first: 0, rows: 20 });

  ngOnInit() {
    this.applyIncomingParams();
    this.syncDatesFromFilters();
    this.fetch();

    forkJoin({
      partners: this.partnerService.getLookups(),
      courseGroups: this.courseGroupService.getLookups(),
      publishStatuses: this.publishStatusService.getLookups(),
    }).subscribe({
      next: ({ partners, courseGroups, publishStatuses }) => {
        this.partners.set(partners);
        this.courseGroups.set(courseGroups);
        this.publishStatuses.set(publishStatuses);
      },
      error: () =>
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入搜尋選項失敗' }),
    });
  }

  get hasFilters(): boolean {
    const f = this.filters;
    return (
      !!f.keyword ||
      f.partnerPkid != null ||
      f.courseGroupPkid != null ||
      f.publishStatusPkid != null ||
      f.canRepeat != null ||
      !!f.scheduleOnFrom ||
      !!f.scheduleOnTo ||
      !!f.scheduleOffFrom ||
      !!f.scheduleOffTo
    );
  }

  /** `?partnerPkid=` etc. from a parent list override (and replace) the saved filters. */
  private applyIncomingParams() {
    const params = this.route.snapshot.queryParamMap;
    const incoming: CourseQuery = {};
    for (const name of INCOMING_PARAMS) {
      const raw = params.get(name);
      if (raw !== null && raw !== '' && !Number.isNaN(Number(raw))) incoming[name] = Number(raw);
    }
    if (Object.keys(incoming).length === 0) return;

    this.filters = incoming;
    save(FILTERS_KEY, this.filters);
    this.page = { ...this.page, first: 0 };
    save(PAGE_KEY, this.page);
  }

  private syncDatesFromFilters() {
    this.dates = {
      scheduleOnFrom: parseIso(this.filters.scheduleOnFrom),
      scheduleOnTo: parseIso(this.filters.scheduleOnTo),
      scheduleOffFrom: parseIso(this.filters.scheduleOffFrom),
      scheduleOffTo: parseIso(this.filters.scheduleOffTo),
    };
  }

  fetch() {
    this.loading.set(true);
    this.service.query(this.filters).subscribe({
      next: (courses) => {
        this.courses.set(courses);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入課程失敗' });
      },
    });
  }

  applyFilters() {
    this.filters = {
      ...this.filters,
      scheduleOnFrom: toIso(this.dates.scheduleOnFrom),
      scheduleOnTo: toIso(this.dates.scheduleOnTo),
      scheduleOffFrom: toIso(this.dates.scheduleOffFrom),
      scheduleOffTo: toIso(this.dates.scheduleOffTo),
    };
    save(FILTERS_KEY, this.filters);
    this.page = { ...this.page, first: 0 };
    save(PAGE_KEY, this.page);
    this.drawerVisible.set(false);
    this.fetch();
  }

  clearFilters() {
    this.filters = {};
    this.dates = { scheduleOnFrom: null, scheduleOnTo: null, scheduleOffFrom: null, scheduleOffTo: null };
    this.applyFilters();
  }

  onSort(event: { field: string; order: number }) {
    this.sort = { field: event.field, order: event.order };
    save(SORT_KEY, this.sort);
  }

  onPage(event: { first: number; rows: number }) {
    this.page = { first: event.first, rows: event.rows };
    save(PAGE_KEY, this.page);
  }

  add() {
    this.router.navigate(['/courses', 'new']);
  }

  view(course: Course) {
    this.router.navigate(['/courses', course.pkid]);
  }

  edit(course: Course) {
    this.router.navigate(['/courses', course.pkid, 'edit']);
  }

  remove(course: Course) {
    this.confirmation.confirm({
      header: '刪除課程',
      message: `確定要刪除主代碼 <b>${course.pkid}</b>「${course.title}」？`,
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonProps: { severity: 'danger' },
      accept: () =>
        this.service.delete(course.pkid).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: '已刪除', detail: course.title });
            this.fetch();
          },
          error: (err: HttpErrorResponse) => {
            const detail =
              err.status === 409 ? '此課程已被常見問題、相關連結或熱門課程使用，無法刪除' : '刪除失敗';
            this.messages.add({ severity: 'error', summary: '錯誤', detail });
          },
        }),
    });
  }

  isEditing(course: Course, field: EditableField): boolean {
    return this.cellEdit?.pkid === course.pkid && this.cellEdit.field === field;
  }

  /** The open editor when it belongs to this cell (template `@if (...; as e)` helper). */
  editFor(course: Course, field: EditableField): CellEdit | null {
    return this.isEditing(course, field) ? this.cellEdit : null;
  }

  /** Double-click handler: opens the in-place editor for one cell. */
  startEdit(course: Course, field: EditableField) {
    if (this.isEditing(course, field) || this.savingPkids().has(course.pkid)) return;
    if (this.cellEdit) {
      // Leaving another open editor commits it; an invalid one stays open instead.
      this.commitEdit();
      if (this.cellEdit) {
        this.focusEditor();
        return;
      }
    }
    const raw = course[field];
    const value = field === 'scheduleOn' || field === 'scheduleOff' ? parseIso(raw as string) : raw;
    this.cellEdit = { pkid: course.pkid, field, value, error: null };
    this.focusEditor();
  }

  cancelEdit() {
    this.cellEdit = null;
  }

  /**
   * Blur handler. Select and date editors also blur while their overlay is open (focus
   * moves into the panel); those commit from their own change/close events instead.
   */
  onEditorBlur(overlayOpen: boolean | null | undefined = false) {
    if (!overlayOpen) this.commitEdit();
  }

  /** Validates the draft and, when it changed, saves it through the Course update endpoint. */
  commitEdit() {
    const edit = this.cellEdit;
    if (!edit) return;
    const course = this.courses().find((c) => c.pkid === edit.pkid);
    if (!course) {
      this.cellEdit = null;
      return;
    }

    edit.error = this.validateCell(course, edit.field, edit.value);
    if (edit.error) return;

    const value = this.toModelValue(edit.field, edit.value);
    this.cellEdit = null;
    if (value === course[edit.field]) return;

    this.saveCell(course, edit.field, value);
  }

  /** Returns the inline error message for a draft value, or null when it's valid. */
  validateCell(course: Course, field: EditableField, value: unknown): string | null {
    switch (field) {
      case 'courseId':
      case 'prodCourseId':
      case 'title': {
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text) return '必填';
        const max = TEXT_MAX[field]!;
        return text.length > max ? `長度不可超過 ${max} 字` : null;
      }
      case 'displayOrder':
        if (value === null || value === undefined || value === '') return '必填';
        return Number.isInteger(value) ? null : '請輸入整數';
      case 'hour':
      case 'listPrice':
      case 'learningCredit': {
        if (value === null || value === undefined || value === '') return '必填';
        if (typeof value !== 'number' || !Number.isFinite(value)) return '請輸入有效數字';
        if (value < 0) return '不可為負數';
        if (field === 'hour' && !Number.isInteger(value)) return '請輸入整數';
        const max = NUMBER_MAX[field]!;
        return value > max ? `不可大於 ${max.toLocaleString()}` : null;
      }
      case 'publishStatusPkid':
        return value === null || value === undefined ? '必填' : null;
      case 'scheduleOn':
      case 'scheduleOff': {
        if (value === null || value === undefined || value === '') return '必填';
        if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '請輸入有效日期';
        const iso = toIso(value)!;
        const on = field === 'scheduleOn' ? iso : course.scheduleOn;
        const off = field === 'scheduleOff' ? iso : course.scheduleOff;
        return on > off ? '上架日期不可晚於下架日期' : null;
      }
      case 'canRepeat':
        return null;
    }
  }

  private toModelValue(field: EditableField, value: unknown): unknown {
    if (field === 'scheduleOn' || field === 'scheduleOff') return toIso(value as Date);
    if (field === 'canRepeat') return !!value;
    return typeof value === 'string' ? value.trim() : value;
  }

  /**
   * Shows the new value at once, then re-reads the course (list rows lack the n-n keys,
   * which PUT replaces) and PUTs it with just this field changed. Reverts on failure.
   */
  private saveCell(course: Course, field: EditableField, value: unknown) {
    const optimistic: Course = { ...course, [field]: value };
    if (field === 'publishStatusPkid') {
      const status = this.publishStatuses().find((s) => s.pkid === value);
      if (status) optimistic.publishStatus = status;
    }
    this.replaceRow(course.pkid, optimistic);
    this.setSaving(course.pkid, true);

    this.service
      .get(course.pkid)
      .pipe(switchMap((current) => this.service.update(toRequest({ ...current, [field]: value }))))
      .subscribe({
        next: (updated) => {
          this.setSaving(course.pkid, false);
          this.replaceRow(course.pkid, updated);
          this.messages.add({ severity: 'success', summary: '已儲存', detail: updated.title });
        },
        error: (err: HttpErrorResponse) => {
          this.setSaving(course.pkid, false);
          this.replaceRow(course.pkid, course);
          const detail =
            err.status === 404
              ? '此課程已不存在，請重新整理'
              : err.status === 400
                ? '資料驗證失敗，已還原'
                : '儲存失敗，已還原';
          this.messages.add({ severity: 'error', summary: '錯誤', detail });
        },
      });
  }

  private replaceRow(pkid: number, course: Course) {
    this.courses.update((rows) => rows.map((c) => (c.pkid === pkid ? course : c)));
  }

  private setSaving(pkid: number, saving: boolean) {
    this.savingPkids.update((set) => {
      const next = new Set(set);
      if (saving) next.add(pkid);
      else next.delete(pkid);
      return next;
    });
  }

  private focusEditor() {
    afterNextRender(
      () => {
        const el = document.getElementById(CELL_EDITOR_ID);
        el?.focus();
        if (el instanceof HTMLInputElement && el.type === 'text') el.select();
      },
      { injector: this.injector },
    );
  }
}

function toRequest(c: Course): CourseRequest {
  return {
    pkid: c.pkid,
    title: c.title,
    officialTitle: c.officialTitle,
    courseId: c.courseId,
    prodCourseId: c.prodCourseId,
    friendlyUrl: c.friendlyUrl,
    displayOrder: c.displayOrder,
    partnerPkid: c.partnerPkid,
    courseGroupPkid: c.courseGroupPkid,
    publishStatusPkid: c.publishStatusPkid,
    scheduleOn: c.scheduleOn,
    scheduleOff: c.scheduleOff,
    hour: c.hour,
    listPrice: c.listPrice,
    learningCredit: c.learningCredit,
    material: c.material,
    objective: c.objective,
    target: c.target,
    prerequisites: c.prerequisites,
    outline: c.outline,
    towardCertOrExam: c.towardCertOrExam,
    note: c.note,
    otherInfo: c.otherInfo,
    canRepeat: c.canRepeat,
    certificationPkids: c.certificationPkids,
    jobCategoryPkids: c.jobCategoryPkids,
  };
}
