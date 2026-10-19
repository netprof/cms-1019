import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AppRole } from '../app-role.model';
import { AppRoleService } from '../app-role.service';
import { AppRoleList } from './app-role-list';

const roles: AppRole[] = [
  { pkid: 1, roleId: 'Admin', roleName: 'Administrator', permissionLevel: 1, description: '系統管理員', userCount: 3, userIds: [] },
  { pkid: 2, roleId: 'User', roleName: 'User', permissionLevel: 100, description: '一般使用者', userCount: 9, userIds: [] },
];

describe('AppRoleList', () => {
  let fixture: ComponentFixture<AppRoleList>;
  let component: AppRoleList;
  let service: jasmine.SpyObj<AppRoleService>;
  let confirmation: ConfirmationService;

  beforeEach(async () => {
    sessionStorage.clear();
    service = jasmine.createSpyObj<AppRoleService>('AppRoleService', ['query', 'delete']);
    service.query.and.returnValue(of(roles));
    service.delete.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [AppRoleList],
      providers: [
        { provide: AppRoleService, useValue: service },
        provideRouter([]),
        provideNoopAnimations(),
        ConfirmationService,
        MessageService,
      ],
    }).compileComponents();

    confirmation = TestBed.inject(ConfirmationService);
    fixture = TestBed.createComponent(AppRoleList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => sessionStorage.clear());

  it('loads and renders the roles', () => {
    expect(service.query).toHaveBeenCalledWith({});
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Administrator');
    expect(rows[1].textContent).toContain('9');
  });

  it('applyFilters() queries with the filters and persists them in sessionStorage', () => {
    component.filters = { keyword: 'adm', minPermissionLevel: 1 };
    component.applyFilters();

    expect(service.query).toHaveBeenCalledWith({ keyword: 'adm', minPermissionLevel: 1 });
    expect(JSON.parse(sessionStorage.getItem('approle-list-filters')!)).toEqual({ keyword: 'adm', minPermissionLevel: 1 });
    expect(component.hasFilters).toBeTrue();
  });

  it('clearFilters() resets the filters and reloads', () => {
    component.filters = { keyword: 'adm' };
    component.clearFilters();

    expect(component.filters).toEqual({});
    expect(service.query).toHaveBeenCalledWith({});
    expect(component.hasFilters).toBeFalse();
  });

  it('remembers sort and page in sessionStorage', () => {
    component.onSort({ field: 'roleName', order: -1 });
    component.onPage({ first: 20, rows: 10 });

    expect(JSON.parse(sessionStorage.getItem('approle-list-sort')!)).toEqual({ field: 'roleName', order: -1 });
    expect(JSON.parse(sessionStorage.getItem('approle-list-page')!)).toEqual({ first: 20, rows: 10 });
  });

  it('restores filters from sessionStorage', () => {
    sessionStorage.setItem('approle-list-filters', JSON.stringify({ keyword: 'saved' }));
    const restored = TestBed.createComponent(AppRoleList).componentInstance;

    expect(restored.filters.keyword).toBe('saved');
  });

  it('navigates to add / view / edit', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    component.add();
    component.view(roles[0]);
    component.edit(roles[1]);

    expect(navigate.calls.allArgs()).toEqual([
      [['/app-roles', 'new']],
      [['/app-roles', 'Admin']],
      [['/app-roles', 'User', 'edit']],
    ]);
  });

  it('remove() deletes after confirmation and reloads', () => {
    spyOn(confirmation, 'confirm').and.callFake((c) => {
      c.accept?.();
      return confirmation;
    });
    service.query.calls.reset();

    component.remove(roles[1]);

    expect(service.delete).toHaveBeenCalledWith('User');
    expect(service.query).toHaveBeenCalledTimes(1);
  });

  it('remove() does nothing when the confirmation is not accepted', () => {
    spyOn(confirmation, 'confirm');

    component.remove(roles[1]);

    expect(service.delete).not.toHaveBeenCalled();
  });
});
