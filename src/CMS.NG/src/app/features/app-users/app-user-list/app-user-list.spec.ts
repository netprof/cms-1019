import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AppUser } from '../app-user.model';
import { AppUserService } from '../app-user.service';
import { AppUserList } from './app-user-list';

const users: AppUser[] = [
  { pkid: 1, userId: 'helen', userName: 'Helen', isActive: true, passwordUpdatedTime: '2026-01-10T08:00:00', roleCount: 2, roleIds: [] },
  { pkid: 2, userId: 'jenny', userName: 'Jenny', isActive: false, passwordUpdatedTime: null, roleCount: 1, roleIds: [] },
];

describe('AppUserList', () => {
  let fixture: ComponentFixture<AppUserList>;
  let component: AppUserList;
  let service: jasmine.SpyObj<AppUserService>;
  let confirmation: ConfirmationService;
  let messages: MessageService;

  async function setup() {
    service = jasmine.createSpyObj<AppUserService>('AppUserService', ['query', 'delete', 'getRoleLookups']);
    service.query.and.returnValue(of(users));
    service.delete.and.returnValue(of(undefined));
    service.getRoleLookups.and.returnValue(of([{ roleId: 'Admin', roleName: 'Administrator' }]));

    await TestBed.configureTestingModule({
      imports: [AppUserList],
      providers: [
        { provide: AppUserService, useValue: service },
        provideRouter([]),
        provideNoopAnimations(),
        ConfirmationService,
        MessageService,
      ],
    }).compileComponents();

    confirmation = TestBed.inject(ConfirmationService);
    messages = TestBed.inject(MessageService);
    fixture = TestBed.createComponent(AppUserList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  describe('default', () => {
    beforeEach(async () => await setup());

    it('loads and renders the users with the active tag and formatted time', () => {
      expect(service.query).toHaveBeenCalledWith({});
      const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);
      expect(rows[0].textContent).toContain('Helen');
      expect(rows[0].textContent).toContain('啟用');
      expect(rows[0].textContent).toMatch(/2026-01-10 \d{2}:\d{2}/);
      expect(rows[1].textContent).toContain('停用');
      expect(rows[1].textContent).toContain('—');
    });

    it('never renders a password hash', () => {
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('passwordHash');
    });

    it('loads the role lookup for the filter drawer', () => {
      expect(component.roleOptions).toEqual([{ roleId: 'Admin', label: 'Administrator (Admin)' }]);
    });

    it('defaults to sorting by userId ascending', () => {
      expect(component.sort).toEqual({ field: 'userId', order: 1 });
    });

    it('applyFilters() converts dates to ISO, queries and persists', () => {
      component.filters = { keyword: 'hel', isActive: true, roleId: 'Admin' };
      component.dates.passwordUpdatedFrom = new Date(2026, 0, 5);
      component.applyFilters();

      const expected = {
        keyword: 'hel', isActive: true, roleId: 'Admin',
        passwordUpdatedFrom: '2026-01-05', passwordUpdatedTo: null,
      };
      expect(service.query).toHaveBeenCalledWith(expected);
      expect(JSON.parse(sessionStorage.getItem('appuser-list-filters')!)).toEqual(expected);
      expect(component.hasFilters).toBeTrue();
    });

    it('clearFilters() resets filters and dates and reloads', () => {
      component.filters = { keyword: 'hel' };
      component.dates.passwordUpdatedTo = new Date(2026, 5, 1);
      component.clearFilters();

      expect(component.dates.passwordUpdatedTo).toBeNull();
      expect(component.hasFilters).toBeFalse();
      expect(service.query.calls.mostRecent().args[0]).toEqual(
        jasmine.objectContaining({ passwordUpdatedTo: null }),
      );
    });

    it('remembers sort and page in sessionStorage', () => {
      component.onSort({ field: 'userName', order: -1 });
      component.onPage({ first: 20, rows: 10 });

      expect(JSON.parse(sessionStorage.getItem('appuser-list-sort')!)).toEqual({ field: 'userName', order: -1 });
      expect(JSON.parse(sessionStorage.getItem('appuser-list-page')!)).toEqual({ first: 20, rows: 10 });
    });

    it('navigates to add / view / edit', () => {
      const navigate = spyOn(TestBed.inject(Router), 'navigate');

      component.add();
      component.view(users[0]);
      component.edit(users[1]);

      expect(navigate.calls.allArgs()).toEqual([
        [['/app-users', 'new']],
        [['/app-users', 'helen']],
        [['/app-users', 'jenny', 'edit']],
      ]);
    });

    it('remove() asks for confirmation with the user id and name', () => {
      const confirm = spyOn(confirmation, 'confirm');

      component.remove(users[0]);

      const options = confirm.calls.mostRecent().args[0];
      expect(options.message).toContain('「helen」');
      expect(options.message).toContain('Helen');
    });

    it('remove() deletes after confirmation and reloads', () => {
      spyOn(confirmation, 'confirm').and.callFake((c) => {
        c.accept?.();
        return confirmation;
      });
      service.query.calls.reset();

      component.remove(users[1]);

      expect(service.delete).toHaveBeenCalledWith('jenny');
      expect(service.query).toHaveBeenCalledTimes(1);
    });

    it('remove() shows an in-use message on 409', () => {
      spyOn(confirmation, 'confirm').and.callFake((c) => {
        c.accept?.();
        return confirmation;
      });
      service.delete.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
      const add = spyOn(messages, 'add');

      component.remove(users[0]);

      expect(add).toHaveBeenCalledWith(
        jasmine.objectContaining({ severity: 'error', detail: jasmine.stringContaining('無法刪除') }),
      );
    });

    it('remove() does nothing when the confirmation is not accepted', () => {
      spyOn(confirmation, 'confirm');

      component.remove(users[1]);

      expect(service.delete).not.toHaveBeenCalled();
    });
  });

  describe('saved filters', () => {
    it('restores filters, including dates, from sessionStorage', async () => {
      sessionStorage.setItem(
        'appuser-list-filters',
        JSON.stringify({ keyword: 'saved', isActive: false, passwordUpdatedFrom: '2026-02-03' }),
      );
      await setup();

      expect(component.filters.keyword).toBe('saved');
      expect(component.filters.isActive).toBeFalse();
      expect(component.dates.passwordUpdatedFrom?.getDate()).toBe(3);
      expect(service.query).toHaveBeenCalledWith({ keyword: 'saved', isActive: false, passwordUpdatedFrom: '2026-02-03' });
    });
  });
});
