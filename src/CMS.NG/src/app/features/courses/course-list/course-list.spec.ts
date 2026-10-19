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
import { CourseList } from './course-list';

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
    service = jasmine.createSpyObj<CourseService>('CourseService', ['query', 'delete']);
    service.query.and.returnValue(of(courses));
    service.delete.and.returnValue(of(undefined));
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
