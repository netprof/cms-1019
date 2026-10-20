import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { CourseGroup, CourseGroupQuery } from '../course-group.model';
import { CourseGroupService } from '../course-group.service';

const FILTERS_KEY = 'coursegroup-list-filters';
const SORT_KEY = 'coursegroup-list-sort';
const PAGE_KEY = 'coursegroup-list-page';

interface SortState {
  field: string;
  order: number;
}

interface PageState {
  first: number;
  rows: number;
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
  selector: 'app-course-group-list',
  imports: [
    FormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DrawerModule,
    InputTextModule,
    TableModule,
    ToastModule,
  ],
  templateUrl: './course-group-list.html',
})
export class CourseGroupList implements OnInit {
  private readonly service = inject(CourseGroupService);
  private readonly router = inject(Router);
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly groups = signal<CourseGroup[]>([]);
  readonly loading = signal(false);
  readonly drawerVisible = signal(false);

  filters: CourseGroupQuery = load<CourseGroupQuery>(FILTERS_KEY, {});
  sort: SortState = load<SortState>(SORT_KEY, { field: 'pkid', order: 1 });
  page: PageState = load<PageState>(PAGE_KEY, { first: 0, rows: 20 });

  ngOnInit() {
    this.fetch();
  }

  get hasFilters(): boolean {
    return !!this.filters.keyword;
  }

  fetch() {
    this.loading.set(true);
    this.service.query(this.filters).subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入課程群組失敗' });
      },
    });
  }

  applyFilters() {
    save(FILTERS_KEY, this.filters);
    this.page = { ...this.page, first: 0 };
    save(PAGE_KEY, this.page);
    this.drawerVisible.set(false);
    this.fetch();
  }

  clearFilters() {
    this.filters = {};
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
    this.router.navigate(['/course-groups', 'new']);
  }

  view(group: CourseGroup) {
    this.router.navigate(['/course-groups', group.pkid]);
  }

  edit(group: CourseGroup) {
    this.router.navigate(['/course-groups', group.pkid, 'edit']);
  }

  /** Primary-Foreign link: courses in this group. */
  viewCourses(group: CourseGroup) {
    this.router.navigate(['/courses'], { queryParams: { courseGroupPkid: group.pkid } });
  }

  remove(group: CourseGroup) {
    this.confirmation.confirm({
      header: '刪除課程群組',
      message: `確定要刪除主代碼 <b>${group.pkid}</b>「${group.description}」？`,
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonProps: { severity: 'danger' },
      accept: () =>
        this.service.delete(group.pkid).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: '已刪除', detail: group.description });
            this.fetch();
          },
          error: (err: HttpErrorResponse) => {
            const detail =
              err.status === 409
                ? '此課程群組已被課程或廠商課程群組使用，無法刪除'
                : '刪除失敗';
            this.messages.add({ severity: 'error', summary: '錯誤', detail });
          },
        }),
    });
  }
}
