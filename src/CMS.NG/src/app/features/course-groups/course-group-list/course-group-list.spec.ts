import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CourseGroup } from '../course-group.model';
import { CourseGroupService } from '../course-group.service';
import { CourseGroupList } from './course-group-list';

const groups: CourseGroup[] = [
  { pkid: 1, description: '基礎課程' },
  { pkid: 2, description: '進階課程' },
];

describe('CourseGroupList', () => {
  let fixture: ComponentFixture<CourseGroupList>;
  let component: CourseGroupList;
  let service: jasmine.SpyObj<CourseGroupService>;
  let confirmation: ConfirmationService;
  let messages: MessageService;

  beforeEach(async () => {
    sessionStorage.clear();
    service = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', ['query', 'delete']);
    service.query.and.returnValue(of(groups));
    service.delete.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [CourseGroupList],
      providers: [
        { provide: CourseGroupService, useValue: service },
        provideRouter([]),
        provideNoopAnimations(),
        ConfirmationService,
        MessageService,
      ],
    }).compileComponents();

    confirmation = TestBed.inject(ConfirmationService);
    messages = TestBed.inject(MessageService);
    fixture = TestBed.createComponent(CourseGroupList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => sessionStorage.clear());

  it('loads and renders the course groups', () => {
    expect(service.query).toHaveBeenCalledWith({});
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('基礎課程');
    expect(rows[1].textContent).toContain('進階課程');
  });

  it('defaults to sorting by pkid ascending', () => {
    expect(component.sort).toEqual({ field: 'pkid', order: 1 });
  });

  it('applyFilters() queries with the keyword and persists it in sessionStorage', () => {
    component.filters = { keyword: '進階' };
    component.applyFilters();

    expect(service.query).toHaveBeenCalledWith({ keyword: '進階' });
    expect(JSON.parse(sessionStorage.getItem('coursegroup-list-filters')!)).toEqual({ keyword: '進階' });
    expect(component.hasFilters).toBeTrue();
  });

  it('clearFilters() resets the filters and reloads', () => {
    component.filters = { keyword: '進階' };
    component.clearFilters();

    expect(component.filters).toEqual({});
    expect(service.query).toHaveBeenCalledWith({});
    expect(component.hasFilters).toBeFalse();
  });

  it('remembers sort and page in sessionStorage', () => {
    component.onSort({ field: 'description', order: -1 });
    component.onPage({ first: 20, rows: 10 });

    expect(JSON.parse(sessionStorage.getItem('coursegroup-list-sort')!)).toEqual({ field: 'description', order: -1 });
    expect(JSON.parse(sessionStorage.getItem('coursegroup-list-page')!)).toEqual({ first: 20, rows: 10 });
  });

  it('restores filters from sessionStorage', () => {
    sessionStorage.setItem('coursegroup-list-filters', JSON.stringify({ keyword: 'saved' }));
    const restored = TestBed.createComponent(CourseGroupList).componentInstance;

    expect(restored.filters.keyword).toBe('saved');
  });

  it('navigates to add / view / edit', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    component.add();
    component.view(groups[0]);
    component.edit(groups[1]);

    expect(navigate.calls.allArgs()).toEqual([
      [['/course-groups', 'new']],
      [['/course-groups', 1]],
      [['/course-groups', 2, 'edit']],
    ]);
  });

  it('viewCourses() opens the course list filtered by this group', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    component.viewCourses(groups[0]);

    expect(navigate).toHaveBeenCalledWith(['/courses'], { queryParams: { courseGroupPkid: 1 } });
  });

  it('remove() asks for confirmation with the pkid and description', () => {
    const confirm = spyOn(confirmation, 'confirm');

    component.remove(groups[0]);

    const options = confirm.calls.mostRecent().args[0];
    expect(options.message).toContain('<b>1</b>');
    expect(options.message).toContain('「基礎課程」');
  });

  it('remove() deletes after confirmation and reloads', () => {
    spyOn(confirmation, 'confirm').and.callFake((c) => {
      c.accept?.();
      return confirmation;
    });
    service.query.calls.reset();

    component.remove(groups[0]);

    expect(service.delete).toHaveBeenCalledWith(1);
    expect(service.query).toHaveBeenCalledTimes(1);
  });

  it('remove() shows an in-use message on 409', () => {
    spyOn(confirmation, 'confirm').and.callFake((c) => {
      c.accept?.();
      return confirmation;
    });
    service.delete.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const add = spyOn(messages, 'add');

    component.remove(groups[0]);

    expect(add).toHaveBeenCalledWith(
      jasmine.objectContaining({ severity: 'error', detail: jasmine.stringContaining('無法刪除') }),
    );
  });

  it('remove() does nothing when the confirmation is not accepted', () => {
    spyOn(confirmation, 'confirm');

    component.remove(groups[0]);

    expect(service.delete).not.toHaveBeenCalled();
  });
});
