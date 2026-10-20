import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { CourseGroupService } from '../../course-groups/course-group.service';
import { PartnerService } from '../../partners/partner.service';
import { PublishStatusService } from '../../publish-statuses/publish-status.service';
import { Course } from '../course.model';
import { CourseService } from '../course.service';
import { expectStickyToolbar } from '../../../core/testing/sticky-toolbar';
import { CourseForm } from './course-form';

const course: Course = {
  pkid: 1, title: 'Azure 基礎', officialTitle: 'Azure Fundamentals', courseId: 'AZ900', prodCourseId: 'AZ-900T00',
  friendlyUrl: 'azure-fundamentals', displayOrder: 2, partnerPkid: 1, courseGroupPkid: 10, publishStatusPkid: 1,
  scheduleOn: '2026-01-01', scheduleOff: '2036-01-01', hour: 8, listPrice: 6000, learningCredit: 12.5,
  material: '原廠教材', objective: null, target: null, prerequisites: null, outline: null,
  towardCertOrExam: null, note: null, otherInfo: null, canRepeat: true, certificationCount: 1, jobCategoryCount: 2,
  partner: { pkid: 1, name: 'Microsoft' }, courseGroup: { pkid: 10, description: '基礎課程' },
  publishStatus: { pkid: 1, description: '已發布' }, certificationPkids: [100], jobCategoryPkids: [5, 6],
};

describe('CourseForm', () => {
  let service: jasmine.SpyObj<CourseService>;
  let router: Router;

  async function setup(id: string | null): Promise<ComponentFixture<CourseForm>> {
    service = jasmine.createSpyObj<CourseService>('CourseService', [
      'get', 'create', 'update', 'getCertificationLookups', 'getJobCategoryLookups',
    ]);
    service.get.and.returnValue(of(course));
    service.create.and.returnValue(of(course));
    service.update.and.returnValue(of(course));
    service.getCertificationLookups.and.returnValue(of([{ pkid: 100, title: 'AZ-900', partnerPkid: 1 }]));
    service.getJobCategoryLookups.and.returnValue(of([{ pkid: 5, description: '系統工程' }, { pkid: 6, description: '雲端' }]));
    const partners = jasmine.createSpyObj<PartnerService>('PartnerService', ['getLookups']);
    partners.getLookups.and.returnValue(of([{ pkid: 1, name: 'Microsoft' }]));
    const groups = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', ['getLookups']);
    groups.getLookups.and.returnValue(of([{ pkid: 10, description: '基礎課程' }]));
    const statuses = jasmine.createSpyObj<PublishStatusService>('PublishStatusService', ['getLookups']);
    statuses.getLookups.and.returnValue(of([{ pkid: 1, description: '已發布' }]));

    await TestBed.configureTestingModule({
      imports: [CourseForm],
      providers: [
        { provide: CourseService, useValue: service },
        { provide: PartnerService, useValue: partners },
        { provide: CourseGroupService, useValue: groups },
        { provide: PublishStatusService, useValue: statuses },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } } },
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    const fixture = TestBed.createComponent(CourseForm);
    fixture.detectChanges();
    return fixture;
  }

  function fillRequired(component: CourseForm) {
    component.form.patchValue({
      title: 'SQL', courseId: 'SQL01', prodCourseId: 'SQL-ADMIN', friendlyUrl: 'sql',
      partnerPkid: 1, publishStatusPkid: 1,
      scheduleOn: new Date(2026, 8, 1), scheduleOff: new Date(2036, 8, 1),
    });
  }

  describe('add', () => {
    let fixture: ComponentFixture<CourseForm>;
    let component: CourseForm;

    beforeEach(async () => {
      fixture = await setup(null);
      component = fixture.componentInstance;
    });

    it('pins the Save/Cancel toolbar to the top of the page', () => {
      expectStickyToolbar(fixture.nativeElement);
    });

    it('loads the lookups, starts with defaults, hides the pkid and does not load a record', () => {
      expect(component.isEdit).toBeFalse();
      expect(component.partners().length).toBe(1);
      expect(component.courseGroups().length).toBe(1);
      expect(component.publishStatuses().length).toBe(1);
      expect(component.certifications().length).toBe(1);
      expect(component.jobCategories().length).toBe(2);
      const v = component.form.getRawValue();
      expect(v.displayOrder).toBe(0);
      expect(v.hour).toBe(0);
      expect(v.listPrice).toBe(0);
      expect(v.learningCredit).toBe(0);
      expect(v.canRepeat).toBeFalse();
      expect(v.partnerPkid).toBeNull();
      expect(v.scheduleOn).toBeNull();
      expect(v.certificationPkids).toEqual([]);
      expect((fixture.nativeElement as HTMLElement).querySelector('#pkid')).toBeNull();
      expect(service.get).not.toHaveBeenCalled();
    });

    it('does not save an invalid form and flags every required field', () => {
      component.save();

      expect(service.create).not.toHaveBeenCalled();
      for (const name of ['title', 'courseId', 'prodCourseId', 'friendlyUrl', 'partnerPkid', 'publishStatusPkid', 'scheduleOn', 'scheduleOff'] as const) {
        expect(component.invalid(name)).withContext(name).toBeTrue();
      }
      expect(component.invalid('officialTitle')).toBeFalse();
      expect(component.invalid('courseGroupPkid')).toBeFalse();
    });

    it('rejects a scheduleOff earlier than scheduleOn', () => {
      fillRequired(component);
      component.form.patchValue({ scheduleOff: new Date(2026, 7, 31) });

      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(component.form.errors).toEqual({ dateRange: true });
      expect(component.dateRangeInvalid).toBeTrue();
    });

    it('defaults scheduleOff to scheduleOn + 10 years until the user edits it', () => {
      component.form.controls.scheduleOn.setValue(new Date(2026, 5, 3));
      expect(component.form.controls.scheduleOff.value).toEqual(new Date(2036, 5, 3));

      component.form.controls.scheduleOff.setValue(new Date(2030, 0, 1));
      component.form.controls.scheduleOn.setValue(new Date(2027, 0, 1));
      expect(component.form.controls.scheduleOff.value).toEqual(new Date(2030, 0, 1));
    });

    it('creates the course with ISO dates, trimmed text, nulls for blanks and pkid 0', () => {
      fillRequired(component);
      component.form.patchValue({
        title: ' SQL Server 管理 ', officialTitle: '   ', material: ' 原廠教材 ', hour: 24, listPrice: 18000,
        learningCredit: 36.5, canRepeat: true, certificationPkids: [100], jobCategoryPkids: [5, 6],
      });

      component.save();

      expect(service.create).toHaveBeenCalledWith(
        jasmine.objectContaining({
          pkid: 0, title: 'SQL Server 管理', officialTitle: null, courseId: 'SQL01', material: '原廠教材',
          partnerPkid: 1, courseGroupPkid: null, publishStatusPkid: 1,
          scheduleOn: '2026-09-01', scheduleOff: '2036-09-01',
          hour: 24, listPrice: 18000, learningCredit: 36.5, canRepeat: true,
          objective: null, outline: null, certificationPkids: [100], jobCategoryPkids: [5, 6],
        }),
      );
      expect(router.navigate).toHaveBeenCalledWith(['/courses']);
    });

    it('stays on the page when the save fails', () => {
      service.create.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      fillRequired(component);

      component.save();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.saving()).toBeFalse();
    });
  });

  describe('edit', () => {
    let fixture: ComponentFixture<CourseForm>;
    let component: CourseForm;

    beforeEach(async () => {
      fixture = await setup('1');
      component = fixture.componentInstance;
    });

    it('pins the Save/Cancel toolbar to the top of the page', () => {
      expectStickyToolbar(fixture.nativeElement);
    });

    it('loads the course into the form and shows the pkid read-only', () => {
      expect(component.isEdit).toBeTrue();
      expect(service.get).toHaveBeenCalledWith(1);
      const v = component.form.getRawValue();
      expect(v.title).toBe('Azure 基礎');
      expect(v.officialTitle).toBe('Azure Fundamentals');
      expect(v.objective).toBe('');
      expect(v.partnerPkid).toBe(1);
      expect(v.courseGroupPkid).toBe(10);
      expect(v.scheduleOn).toEqual(new Date(2026, 0, 1));
      expect(v.scheduleOff).toEqual(new Date(2036, 0, 1));
      expect(v.learningCredit).toBe(12.5);
      expect(v.canRepeat).toBeTrue();
      expect(v.certificationPkids).toEqual([100]);
      expect(v.jobCategoryPkids).toEqual([5, 6]);
      const pkidInput = (fixture.nativeElement as HTMLElement).querySelector('#pkid') as HTMLInputElement;
      expect(pkidInput.value).toBe('1');
      expect(pkidInput.disabled).toBeTrue();
    });

    it('does not auto-default scheduleOff in edit mode', () => {
      component.form.controls.scheduleOn.setValue(new Date(2027, 0, 1));

      expect(component.form.controls.scheduleOff.value).toEqual(new Date(2036, 0, 1));
    });

    it('updates the course with the route pkid and returns to the list', () => {
      component.form.patchValue({ title: 'Azure 基礎（新版）', courseGroupPkid: null, certificationPkids: [] });

      component.save();

      expect(service.update).toHaveBeenCalledWith(
        jasmine.objectContaining({
          pkid: 1, title: 'Azure 基礎（新版）', courseGroupPkid: null, certificationPkids: [],
          jobCategoryPkids: [5, 6], scheduleOn: '2026-01-01',
        }),
      );
      expect(router.navigate).toHaveBeenCalledWith(['/courses']);
    });

    it('cancel() returns to the list without saving', () => {
      component.cancel();

      expect(service.update).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/courses']);
    });
  });
});
