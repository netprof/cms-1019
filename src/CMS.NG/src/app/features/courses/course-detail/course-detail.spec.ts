import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { Course } from '../course.model';
import { CourseService } from '../course.service';
import { CourseDetail } from './course-detail';

const course: Course = {
  pkid: 1, title: 'Azure 基礎', officialTitle: null, courseId: 'AZ900', prodCourseId: 'AZ-900T00',
  friendlyUrl: 'azure-fundamentals', displayOrder: 2, partnerPkid: 1, courseGroupPkid: 10, publishStatusPkid: 1,
  scheduleOn: '2026-01-01', scheduleOff: '2036-01-01', hour: 8, listPrice: 6000, learningCredit: 12.5,
  material: null, objective: '了解 Azure\n核心服務', target: null, prerequisites: null, outline: null,
  towardCertOrExam: null, note: null, otherInfo: null, canRepeat: true, certificationCount: 1, jobCategoryCount: 2,
  partner: { pkid: 1, name: 'Microsoft' }, courseGroup: { pkid: 10, description: '基礎課程' },
  publishStatus: { pkid: 1, description: '已發布' }, certificationPkids: [100], jobCategoryPkids: [5, 99],
};

describe('CourseDetail', () => {
  let service: jasmine.SpyObj<CourseService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<CourseService>('CourseService', [
      'get', 'getCertificationLookups', 'getJobCategoryLookups',
    ]);
    service.get.and.returnValue(of(course));
    service.getCertificationLookups.and.returnValue(of([{ pkid: 100, title: 'AZ-900', partnerPkid: 1 }]));
    service.getJobCategoryLookups.and.returnValue(of([{ pkid: 5, description: '系統工程' }]));

    await TestBed.configureTestingModule({
      imports: [CourseDetail],
      providers: [
        { provide: CourseService, useValue: service },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '1' }) } } },
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();
  });

  it('loads the course by numeric route id and renders its fields', () => {
    const fixture = TestBed.createComponent(CourseDetail);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(service.get).toHaveBeenCalledWith(1);
    expect(el.textContent).toContain('Azure 基礎');
    expect(el.textContent).toContain('AZ-900T00');
    expect(el.textContent).toContain('2026/01/01');
    expect(el.textContent).toContain('6,000');
    expect(el.textContent).toContain('12.5');
    expect(el.querySelector('#official-title')?.textContent?.trim()).toBe('—');
    expect(el.querySelector('#partner-link')?.getAttribute('href')).toBe('/partners/1');
    expect(el.querySelector('#course-group a')?.getAttribute('href')).toBe('/course-groups/10');
    expect(el.querySelector('#publish-status-link')?.getAttribute('href')).toBe('/publish-statuses/1');
    expect(el.textContent).toContain('了解 Azure');
  });

  it('shows a dash when the course group is null', () => {
    service.get.and.returnValue(of({ ...course, courseGroup: null, courseGroupPkid: null }));
    const fixture = TestBed.createComponent(CourseDetail);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('#course-group')?.textContent?.trim()).toBe('—');
  });

  it('resolves linked certifications and job categories to labels', () => {
    const fixture = TestBed.createComponent(CourseDetail);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.certificationLabels()).toEqual(['AZ-900']);
    // Unknown id falls back to the raw pkid.
    expect(fixture.componentInstance.jobCategoryLabels()).toEqual(['系統工程', '99']);
    expect(el.querySelector('#certification-chips')?.textContent).toContain('AZ-900');
    expect(el.querySelector('#job-category-chips')?.textContent).toContain('系統工程');
  });

  it('navigates to edit and back', () => {
    const fixture = TestBed.createComponent(CourseDetail);
    fixture.detectChanges();
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    fixture.componentInstance.edit();
    fixture.componentInstance.back();

    expect(navigate.calls.allArgs()).toEqual([[['/courses', 1, 'edit']], [['/courses']]]);
  });
});
