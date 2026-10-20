import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Partner } from '../partner.model';
import { PartnerService } from '../partner.service';
import { PartnerList } from './partner-list';

const partners: Partner[] = [
  {
    pkid: 2, name: 'Cisco', appKey: 'csco', nameOnPartnerMenu: 'Cisco 思科',
    nameOnCourseDetailPage: 'Cisco', displayOrder: 1, imageFilename: null,
  },
  {
    pkid: 1, name: 'Microsoft', appKey: 'msft', nameOnPartnerMenu: 'Microsoft 微軟',
    nameOnCourseDetailPage: 'Microsoft', displayOrder: 2, imageFilename: 'microsoft.png',
  },
];

describe('PartnerList', () => {
  let fixture: ComponentFixture<PartnerList>;
  let component: PartnerList;
  let service: jasmine.SpyObj<PartnerService>;
  let confirmation: ConfirmationService;
  let messages: MessageService;

  beforeEach(async () => {
    sessionStorage.clear();
    service = jasmine.createSpyObj<PartnerService>('PartnerService', ['query', 'delete']);
    service.query.and.returnValue(of(partners));
    service.delete.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [PartnerList],
      providers: [
        { provide: PartnerService, useValue: service },
        provideRouter([]),
        provideNoopAnimations(),
        ConfirmationService,
        MessageService,
      ],
    }).compileComponents();

    confirmation = TestBed.inject(ConfirmationService);
    messages = TestBed.inject(MessageService);
    fixture = TestBed.createComponent(PartnerList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => sessionStorage.clear());

  it('loads and renders the partners', () => {
    expect(service.query).toHaveBeenCalledWith({});
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Cisco');
    expect(rows[1].textContent).toContain('Microsoft');
  });

  it('shows a dash for a missing image filename', () => {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('—');
    expect(rows[1].textContent).toContain('microsoft.png');
  });

  it('defaults to sorting by displayOrder ascending', () => {
    expect(component.sort).toEqual({ field: 'displayOrder', order: 1 });
  });

  it('applyFilters() queries with the keyword and persists it in sessionStorage', () => {
    component.filters = { keyword: 'cis' };
    component.applyFilters();

    expect(service.query).toHaveBeenCalledWith({ keyword: 'cis' });
    expect(JSON.parse(sessionStorage.getItem('partner-list-filters')!)).toEqual({ keyword: 'cis' });
    expect(component.hasFilters).toBeTrue();
  });

  it('clearFilters() resets the filters and reloads', () => {
    component.filters = { keyword: 'cis' };
    component.clearFilters();

    expect(component.filters).toEqual({});
    expect(service.query).toHaveBeenCalledWith({});
    expect(component.hasFilters).toBeFalse();
  });

  it('remembers sort and page in sessionStorage', () => {
    component.onSort({ field: 'name', order: -1 });
    component.onPage({ first: 20, rows: 10 });

    expect(JSON.parse(sessionStorage.getItem('partner-list-sort')!)).toEqual({ field: 'name', order: -1 });
    expect(JSON.parse(sessionStorage.getItem('partner-list-page')!)).toEqual({ first: 20, rows: 10 });
  });

  it('restores filters from sessionStorage', () => {
    sessionStorage.setItem('partner-list-filters', JSON.stringify({ keyword: 'saved' }));
    const restored = TestBed.createComponent(PartnerList).componentInstance;

    expect(restored.filters.keyword).toBe('saved');
  });

  it('navigates to add / view / edit', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    component.add();
    component.view(partners[0]);
    component.edit(partners[1]);

    expect(navigate.calls.allArgs()).toEqual([
      [['/partners', 'new']],
      [['/partners', 2]],
      [['/partners', 1, 'edit']],
    ]);
  });

  it('viewCourses() opens the course list filtered by this partner', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    component.viewCourses(partners[0]);

    expect(navigate).toHaveBeenCalledWith(['/courses'], { queryParams: { partnerPkid: 2 } });
  });

  it('remove() asks for confirmation with the pkid and name', () => {
    const confirm = spyOn(confirmation, 'confirm');

    component.remove(partners[0]);

    const options = confirm.calls.mostRecent().args[0];
    expect(options.message).toContain('<b>2</b>');
    expect(options.message).toContain('「Cisco」');
  });

  it('remove() deletes after confirmation and reloads', () => {
    spyOn(confirmation, 'confirm').and.callFake((c) => {
      c.accept?.();
      return confirmation;
    });
    service.query.calls.reset();

    component.remove(partners[0]);

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

    component.remove(partners[0]);

    expect(add).toHaveBeenCalledWith(
      jasmine.objectContaining({ severity: 'error', detail: jasmine.stringContaining('無法刪除') }),
    );
  });

  it('remove() does nothing when the confirmation is not accepted', () => {
    spyOn(confirmation, 'confirm');

    component.remove(partners[0]);

    expect(service.delete).not.toHaveBeenCalled();
  });
});
