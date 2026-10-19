import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { CourseGroup } from '../course-group.model';
import { CourseGroupService } from '../course-group.service';
import { CourseGroupDetail } from './course-group-detail';

const group: CourseGroup = { pkid: 2, description: '進階課程' };

describe('CourseGroupDetail', () => {
  let service: jasmine.SpyObj<CourseGroupService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', ['get']);
    service.get.and.returnValue(of(group));

    await TestBed.configureTestingModule({
      imports: [CourseGroupDetail],
      providers: [
        { provide: CourseGroupService, useValue: service },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '2' }) } } },
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();
  });

  it('loads the course group by numeric route id and renders its fields', () => {
    const fixture = TestBed.createComponent(CourseGroupDetail);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(service.get).toHaveBeenCalledWith(2);
    expect(el.textContent).toContain('主代碼');
    expect(el.querySelector('#description')?.textContent?.trim()).toBe('進階課程');
  });

  it('navigates to edit and back', () => {
    const fixture = TestBed.createComponent(CourseGroupDetail);
    fixture.detectChanges();
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    fixture.componentInstance.edit();
    fixture.componentInstance.back();

    expect(navigate.calls.allArgs()).toEqual([[['/course-groups', 2, 'edit']], [['/course-groups']]]);
  });

  it('viewCourses() opens the course list filtered by this group', () => {
    const fixture = TestBed.createComponent(CourseGroupDetail);
    fixture.detectChanges();
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    fixture.componentInstance.viewCourses();

    expect(navigate).toHaveBeenCalledWith(['/courses'], { queryParams: { courseGroupPkid: 2 } });
    expect((fixture.nativeElement as HTMLElement).querySelector('#courses-button')).not.toBeNull();
  });
});
