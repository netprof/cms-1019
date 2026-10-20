import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CourseGroupService } from '../../course-groups/course-group.service';
import { PartnerService } from '../../partners/partner.service';
import { PublishStatusService } from '../../publish-statuses/publish-status.service';
import { Course } from '../course.model';
import { CourseService } from '../course.service';
import { CourseList, EditableField } from './course-list';

const base: Omit<Course, 'pkid' | 'title' | 'courseId' | 'displayOrder' | 'partner' | 'courseGroup' | 'canRepeat'> = {
  officialTitle: null, prodCourseId: 'P', friendlyUrl: 'f', partnerPkid: 1, courseGroupPkid: null,
  publishStatusPkid: 1, scheduleOn: '2026-01-01', scheduleOff: '2036-01-01', hour: 8, listPrice: 6000,
  learningCredit: 12.5, material: null, objective: null, target: null, prerequisites: null, outline: null,
  towardCertOrExam: null, note: null, otherInfo: null, certificationCount: 0, jobCategoryCount: 0,
  publishStatus: { pkid: 1, description: '已發布' }, certificationPkids: [], jobCategoryPkids: [],
};

const courses: Course[] = [
  {
    ...base, pkid: 2, title: 'CCNA 網路', courseId: 'CCNA', displayOrder: 1, canRepeat: false,
    partner: { pkid: 2, name: 'Cisco' }, courseGroup: null,
  },
  {
    ...base, pkid: 1, title: 'Azure 基礎', courseId: 'AZ900', displayOrder: 2, canRepeat: true,
    partner: { pkid: 1, name: 'Microsoft' }, courseGroup: { pkid: 10, description: '基礎課程' },
  },
];

describe('CourseList', () => {
  let fixture: ComponentFixture<CourseList>;
  let component: CourseList;
  let service: jasmine.SpyObj<CourseService>;
  let confirmation: ConfirmationService;
  let messages: MessageService;

  async function setup(queryParams: Record<string, string> = {}) {
    service = jasmine.createSpyObj<CourseService>('CourseService', ['query', 'delete', 'get', 'update']);
    service.query.and.returnValue(of(courses));
    service.delete.and.returnValue(of(undefined));
    // Single-record reads carry the n-n keys the list rows lack.
    service.get.and.callFake((id: number) =>
      of({ ...courses.find((c) => c.pkid === id)!, certificationPkids: [5], jobCategoryPkids: [7] }),
    );
    service.update.and.callFake((request) => {
      const current = courses.find((c) => c.pkid === request.pkid)!;
      return of({ ...current, ...request });
    });
    const partners = jasmine.createSpyObj<PartnerService>('PartnerService', ['getLookups']);
    partners.getLookups.and.returnValue(of([{ pkid: 1, name: 'Microsoft' }]));
    const groups = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', ['getLookups']);
    groups.getLookups.and.returnValue(of([{ pkid: 10, description: '基礎課程' }]));
    const statuses = jasmine.createSpyObj<PublishStatusService>('PublishStatusService', ['getLookups']);
    statuses.getLookups.and.returnValue(of([{ pkid: 1, description: '已發布' }]));

    await TestBed.configureTestingModule({
      imports: [CourseList],
      providers: [
        { provide: CourseService, useValue: service },
        { provide: PartnerService, useValue: partners },
        { provide: CourseGroupService, useValue: groups },
        { provide: PublishStatusService, useValue: statuses },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
        provideNoopAnimations(),
        ConfirmationService,
        MessageService,
      ],
    }).compileComponents();

    confirmation = TestBed.inject(ConfirmationService);
    messages = TestBed.inject(MessageService);
    fixture = TestBed.createComponent(CourseList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  describe('default', () => {
    beforeEach(async () => await setup());

    it('loads and renders the courses with nav labels', () => {
      expect(service.query).toHaveBeenCalledWith({});
      const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);
      expect(rows[0].textContent).toContain('CCNA 網路');
      expect(rows[0].textContent).toContain('Cisco');
      expect(rows[0].textContent).toContain('—'); // null course group
      expect(rows[1].textContent).toContain('Microsoft');
      expect(rows[1].textContent).toContain('基礎課程');
      expect(rows[1].textContent).toContain('已發布');
      expect(rows[1].textContent).toContain('2026/01/01');
    });

    it('loads the lookups for the filter drawer', () => {
      expect(component.partners()).toEqual([{ pkid: 1, name: 'Microsoft' }]);
      expect(component.courseGroups().length).toBe(1);
      expect(component.publishStatuses().length).toBe(1);
    });

    it('defaults to sorting by displayOrder ascending', () => {
      expect(component.sort).toEqual({ field: 'displayOrder', order: 1 });
    });

    it('applyFilters() converts dates to ISO, queries and persists', () => {
      component.filters = { keyword: 'az', partnerPkid: 1, canRepeat: true };
      component.dates.scheduleOnFrom = new Date(2026, 0, 5);
      component.applyFilters();

      const expected = {
        keyword: 'az', partnerPkid: 1, canRepeat: true,
        scheduleOnFrom: '2026-01-05', scheduleOnTo: null, scheduleOffFrom: null, scheduleOffTo: null,
      };
      expect(service.query).toHaveBeenCalledWith(expected);
      expect(JSON.parse(sessionStorage.getItem('course-list-filters')!)).toEqual(expected);
      expect(component.hasFilters).toBeTrue();
    });

    it('clearFilters() resets filters and dates and reloads', () => {
      component.filters = { keyword: 'az' };
      component.dates.scheduleOffTo = new Date(2036, 0, 1);
      component.clearFilters();

      expect(component.dates.scheduleOffTo).toBeNull();
      expect(component.hasFilters).toBeFalse();
      expect(service.query.calls.mostRecent().args[0]).toEqual(
        jasmine.objectContaining({ scheduleOffTo: null }),
      );
    });

    it('remembers sort and page in sessionStorage', () => {
      component.onSort({ field: 'partner.name', order: -1 });
      component.onPage({ first: 20, rows: 10 });

      expect(JSON.parse(sessionStorage.getItem('course-list-sort')!)).toEqual({ field: 'partner.name', order: -1 });
      expect(JSON.parse(sessionStorage.getItem('course-list-page')!)).toEqual({ first: 20, rows: 10 });
    });

    it('navigates to add / view / edit', () => {
      const navigate = spyOn(TestBed.inject(Router), 'navigate');

      component.add();
      component.view(courses[0]);
      component.edit(courses[1]);

      expect(navigate.calls.allArgs()).toEqual([
        [['/courses', 'new']],
        [['/courses', 2]],
        [['/courses', 1, 'edit']],
      ]);
    });

    it('remove() asks for confirmation with the pkid and title', () => {
      const confirm = spyOn(confirmation, 'confirm');

      component.remove(courses[0]);

      const options = confirm.calls.mostRecent().args[0];
      expect(options.message).toContain('<b>2</b>');
      expect(options.message).toContain('「CCNA 網路」');
    });

    it('remove() deletes after confirmation and reloads', () => {
      spyOn(confirmation, 'confirm').and.callFake((c) => {
        c.accept?.();
        return confirmation;
      });
      service.query.calls.reset();

      component.remove(courses[0]);

      expect(service.delete).toHaveBeenCalledWith(2);
      expect(service.query).toHaveBeenCalledTimes(1);
    });

    it('remove() shows an in-use message on 409', () => {
      spyOn(confirmation, 'confirm').and.callFake((c) => {
        c.accept?.();
        return confirmation;
      });
      service.delete.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
      const add = spyOn(messages, 'add');

      component.remove(courses[0]);

      expect(add).toHaveBeenCalledWith(
        jasmine.objectContaining({ severity: 'error', detail: jasmine.stringContaining('無法刪除') }),
      );
    });
  });

  describe('inline editing', () => {
    beforeEach(async () => await setup());

    /** Cell of the first rendered row (pkid 2, sorted by displayOrder). */
    function cell(field: string): HTMLTableCellElement {
      const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr')!;
      return row.querySelector(`td[data-field="${field}"]`) as HTMLTableCellElement;
    }

    async function dblclick(field: string) {
      cell(field).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    async function typeAndBlur(field: string, text: string) {
      const input = cell(field).querySelector('input') as HTMLInputElement;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      await fixture.whenStable();
    }

    /** Opens an editor through the component, sets the draft and commits it. */
    function commit(field: EditableField, value: unknown) {
      component.startEdit(component.courses()[0], field);
      component.cellEdit!.value = value;
      component.commitEdit();
      fixture.detectChanges();
    }

    it('a single click does not enter edit mode', () => {
      cell('title').click();
      fixture.detectChanges();

      expect(component.cellEdit).toBeNull();
      expect(cell('title').querySelector('input')).toBeNull();
    });

    it('a double-click enters edit mode with the current value', async () => {
      await dblclick('title');

      const input = cell('title').querySelector('input') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.value).toBe('CCNA 網路');
      expect(component.cellEdit).toEqual(jasmine.objectContaining({ pkid: 2, field: 'title' }));
    });

    it('uses an editor matching each column type', async () => {
      const editors: [string, string][] = [
        ['displayOrder', 'p-inputnumber'],
        ['courseId', 'input[pInputText]'],
        ['prodCourseId', 'input[pInputText]'],
        ['title', 'input[pInputText]'],
        ['publishStatusPkid', 'p-select'],
        ['scheduleOn', 'p-datepicker'],
        ['scheduleOff', 'p-datepicker'],
        ['hour', 'p-inputnumber'],
        ['listPrice', 'p-inputnumber'],
        ['learningCredit', 'p-inputnumber'],
        ['canRepeat', 'p-checkbox'],
      ];
      for (const [field, selector] of editors) {
        await dblclick(field);
        expect(cell(field).querySelector(selector)).withContext(field).not.toBeNull();
        component.cancelEdit();
        fixture.detectChanges();
      }
    });

    for (const field of ['pkid', 'partner', 'courseGroup']) {
      it(`the read-only ${field} column cannot be edited`, async () => {
        await dblclick(field);

        expect(component.cellEdit).toBeNull();
        expect(cell(field).querySelector('input, p-select, p-inputnumber')).toBeNull();
      });
    }

    it('blur saves through the update endpoint, keeping the n-n keys', async () => {
      await dblclick('title');
      await typeAndBlur('title', '  CCNA 進階  ');

      expect(service.get).toHaveBeenCalledWith(2);
      expect(service.update).toHaveBeenCalledWith(
        jasmine.objectContaining({
          pkid: 2, title: 'CCNA 進階', courseId: 'CCNA', certificationPkids: [5], jobCategoryPkids: [7],
        }),
      );
      expect(component.cellEdit).toBeNull();
      expect(cell('title').textContent).toContain('CCNA 進階');
    });

    it('blur without a change does not call the endpoint', async () => {
      await dblclick('title');
      await typeAndBlur('title', 'CCNA 網路');

      expect(service.update).not.toHaveBeenCalled();
      expect(component.cellEdit).toBeNull();
    });

    it('Escape cancels without saving', async () => {
      await dblclick('title');
      const input = cell('title').querySelector('input') as HTMLInputElement;
      input.value = 'x';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();

      expect(component.cellEdit).toBeNull();
      expect(service.update).not.toHaveBeenCalled();
      expect(cell('title').textContent).toContain('CCNA 網路');
    });

    it('a cleared required field shows an inline error and stays in edit mode', async () => {
      await dblclick('title');
      await typeAndBlur('title', '   ');
      fixture.detectChanges();

      expect(service.update).not.toHaveBeenCalled();
      expect(component.cellEdit?.error).toBe('必填');
      expect(cell('title').querySelector('input')).not.toBeNull();
      expect(cell('title').querySelector('.cell-error')?.textContent).toContain('必填');
    });

    for (const field of ['hour', 'listPrice', 'learningCredit'] as EditableField[]) {
      it(`${field} must be a valid non-negative number`, () => {
        commit(field, -1);
        expect(component.cellEdit?.error).toBe('不可為負數');

        component.cellEdit!.value = Number.NaN;
        component.commitEdit();
        expect(component.cellEdit?.error).toBe('請輸入有效數字');

        component.cellEdit!.value = null;
        component.commitEdit();
        expect(component.cellEdit?.error).toBe('必填');

        expect(service.update).not.toHaveBeenCalled();
      });
    }

    it('accepts zero for a numeric field', () => {
      commit('listPrice', 0);

      expect(component.cellEdit).toBeNull();
      expect(service.update).toHaveBeenCalledWith(jasmine.objectContaining({ listPrice: 0 }));
    });

    for (const field of ['scheduleOn', 'scheduleOff'] as EditableField[]) {
      it(`${field} must be a valid, non-empty date`, () => {
        commit(field, new Date(Number.NaN));
        expect(component.cellEdit?.error).toBe('請輸入有效日期');

        component.cellEdit!.value = null;
        component.commitEdit();
        expect(component.cellEdit?.error).toBe('必填');

        expect(service.update).not.toHaveBeenCalled();
      });
    }

    it('上架日期 may not be after 下架日期', () => {
      commit('scheduleOn', new Date(2036, 0, 2)); // scheduleOff is 2036-01-01
      expect(component.cellEdit?.error).toBe('上架日期不可晚於下架日期');
      component.cancelEdit();

      commit('scheduleOff', new Date(2025, 11, 31)); // scheduleOn is 2026-01-01
      expect(component.cellEdit?.error).toBe('上架日期不可晚於下架日期');

      expect(service.update).not.toHaveBeenCalled();
    });

    it('saves a valid date as ISO yyyy-MM-dd (same day as 下架日期 allowed)', () => {
      commit('scheduleOn', new Date(2036, 0, 1));

      expect(component.cellEdit).toBeNull();
      expect(service.update).toHaveBeenCalledWith(jasmine.objectContaining({ scheduleOn: '2036-01-01' }));
    });

    it('saves 上架狀態 and 允許重聽 changes', () => {
      commit('publishStatusPkid', 3);
      expect(service.update).toHaveBeenCalledWith(jasmine.objectContaining({ publishStatusPkid: 3 }));

      commit('canRepeat', true);
      expect(service.update).toHaveBeenCalledWith(jasmine.objectContaining({ canRepeat: true }));
    });

    it('reverts the cell and shows an error when the save fails', async () => {
      service.update.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      const add = spyOn(messages, 'add');

      await dblclick('title');
      await typeAndBlur('title', 'CCNA 進階');
      fixture.detectChanges();

      expect(service.update).toHaveBeenCalled();
      expect(component.courses()[0].title).toBe('CCNA 網路');
      expect(cell('title').textContent).toContain('CCNA 網路');
      expect(component.savingPkids().size).toBe(0);
      expect(add).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'error' }));
    });
  });

  describe('saved and incoming filters', () => {
    it('restores saved filters, including dates, from sessionStorage', async () => {
      sessionStorage.setItem(
        'course-list-filters',
        JSON.stringify({ keyword: 'saved', scheduleOnFrom: '2026-02-03' }),
      );
      await setup();

      expect(component.filters.keyword).toBe('saved');
      expect(component.dates.scheduleOnFrom?.getDate()).toBe(3);
      expect(service.query).toHaveBeenCalledWith({ keyword: 'saved', scheduleOnFrom: '2026-02-03' });
    });

    it('an incoming partnerPkid param overrides saved filters and is persisted', async () => {
      sessionStorage.setItem('course-list-filters', JSON.stringify({ keyword: 'saved' }));
      await setup({ partnerPkid: '2' });

      expect(component.filters).toEqual({ partnerPkid: 2 });
      expect(service.query).toHaveBeenCalledWith({ partnerPkid: 2 });
      expect(JSON.parse(sessionStorage.getItem('course-list-filters')!)).toEqual({ partnerPkid: 2 });
    });

    it('accepts courseGroupPkid and publishStatusPkid params', async () => {
      await setup({ courseGroupPkid: '10', publishStatusPkid: '1' });

      expect(component.filters).toEqual({ courseGroupPkid: 10, publishStatusPkid: 1 });
    });

    it('ignores a non-numeric incoming param', async () => {
      await setup({ partnerPkid: 'abc' });

      expect(component.filters).toEqual({});
    });
  });
});
