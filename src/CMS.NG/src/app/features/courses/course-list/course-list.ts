import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DrawerModule } from 'primeng/drawer';
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
import { Course, CourseQuery } from '../course.model';
import { CourseService } from '../course.service';

const FILTERS_KEY = 'course-list-filters';
const SORT_KEY = 'course-list-sort';
const PAGE_KEY = 'course-list-page';

/** Query params a parent list can pass to pre-filter this list. */
const INCOMING_PARAMS = ['partnerPkid', 'courseGroupPkid', 'publishStatusPkid'] as const;

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
    ConfirmDialogModule,
    DatePickerModule,
    DrawerModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
  ],
  templateUrl: './course-list.html',
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

  readonly courses = signal<Course[]>([]);
  readonly loading = signal(false);
  readonly drawerVisible = signal(false);
  readonly partners = signal<PartnerLookup[]>([]);
  readonly courseGroups = signal<CourseGroupLookup[]>([]);
  readonly publishStatuses = signal<PublishStatusLookup[]>([]);

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
}
