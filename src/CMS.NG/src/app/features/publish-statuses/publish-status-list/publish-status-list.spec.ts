import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { PublishStatus } from '../publish-status.model';
import { PublishStatusService } from '../publish-status.service';
import { PublishStatusList } from './publish-status-list';

const statuses: PublishStatus[] = [
  { pkid: 1, description: '草稿', isDraft: true, isPublished: false, isDiscontinued: false },
  { pkid: 2, description: '已發布', isDraft: false, isPublished: true, isDiscontinued: false },
];

describe('PublishStatusList', () => {
  let fixture: ComponentFixture<PublishStatusList>;
  let component: PublishStatusList;
  let service: jasmine.SpyObj<PublishStatusService>;
  let confirmation: ConfirmationService;
  let messages: MessageService;

  beforeEach(async () => {
    sessionStorage.clear();
    service = jasmine.createSpyObj<PublishStatusService>('PublishStatusService', ['query', 'delete']);
    service.query.and.returnValue(of(statuses));
    service.delete.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [PublishStatusList],
      providers: [
        { provide: PublishStatusService, useValue: service },
        provideRouter([]),
        provideNoopAnimations(),
        ConfirmationService,
        MessageService,
      ],
    }).compileComponents();

    confirmation = TestBed.inject(ConfirmationService);
    messages = TestBed.inject(MessageService);
    fixture = TestBed.createComponent(PublishStatusList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => sessionStorage.clear());

  it('loads and renders the statuses', () => {
    expect(service.query).toHaveBeenCalledWith({});
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('草稿');
    expect(rows[1].textContent).toContain('已發布');
  });

  it('defaults to sorting by pkid ascending', () => {
    expect(component.sort).toEqual({ field: 'pkid', order: 1 });
  });

  it('applyFilters() queries with the filters and persists them in sessionStorage', () => {
    component.filters = { keyword: '草', isPublished: false };
    component.applyFilters();

    expect(service.query).toHaveBeenCalledWith({ keyword: '草', isPublished: false });
    expect(JSON.parse(sessionStorage.getItem('publishstatus-list-filters')!)).toEqual({ keyword: '草', isPublished: false });
    expect(component.hasFilters).toBeTrue();
  });

  it('treats a false bool filter as an active filter', () => {
    component.filters = { isDraft: false };
    expect(component.hasFilters).toBeTrue();
  });

  it('clearFilters() resets the filters and reloads', () => {
    component.filters = { keyword: '草', isDraft: true };
    component.clearFilters();

    expect(component.filters).toEqual({});
    expect(service.query).toHaveBeenCalledWith({});
    expect(component.hasFilters).toBeFalse();
  });

  it('remembers sort and page in sessionStorage', () => {
    component.onSort({ field: 'description', order: -1 });
    component.onPage({ first: 20, rows: 10 });

    expect(JSON.parse(sessionStorage.getItem('publishstatus-list-sort')!)).toEqual({ field: 'description', order: -1 });
    expect(JSON.parse(sessionStorage.getItem('publishstatus-list-page')!)).toEqual({ first: 20, rows: 10 });
  });

  it('restores filters from sessionStorage', () => {
    sessionStorage.setItem('publishstatus-list-filters', JSON.stringify({ keyword: 'saved' }));
    const restored = TestBed.createComponent(PublishStatusList).componentInstance;

    expect(restored.filters.keyword).toBe('saved');
  });

  it('viewCourses() opens the course list filtered by this status', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    component.viewCourses(statuses[0]);

    expect(navigate).toHaveBeenCalledWith(['/courses'], { queryParams: { publishStatusPkid: 1 } });
  });

  it('navigates to add / view / edit', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    component.add();
    component.view(statuses[0]);
    component.edit(statuses[1]);

    expect(navigate.calls.allArgs()).toEqual([
      [['/publish-statuses', 'new']],
      [['/publish-statuses', 1]],
      [['/publish-statuses', 2, 'edit']],
    ]);
  });

  it('remove() asks for confirmation with the pkid and description', () => {
    const confirm = spyOn(confirmation, 'confirm');

    component.remove(statuses[1]);

    const options = confirm.calls.mostRecent().args[0];
    expect(options.message).toContain('<b>2</b>');
    expect(options.message).toContain('「已發布」');
  });

  it('remove() deletes after confirmation and reloads', () => {
    spyOn(confirmation, 'confirm').and.callFake((c) => {
      c.accept?.();
      return confirmation;
    });
    service.query.calls.reset();

    component.remove(statuses[1]);

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

    component.remove(statuses[1]);

    expect(add).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'error', detail: jasmine.stringContaining('無法刪除') }));
  });

  it('remove() does nothing when the confirmation is not accepted', () => {
    spyOn(confirmation, 'confirm');

    component.remove(statuses[1]);

    expect(service.delete).not.toHaveBeenCalled();
  });
});
