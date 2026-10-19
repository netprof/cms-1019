import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AppRoleService } from '../app-role.service';
import { AppRoleDetail } from './app-role-detail';

describe('AppRoleDetail', () => {
  let service: jasmine.SpyObj<AppRoleService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<AppRoleService>('AppRoleService', ['get', 'getUserLookups']);
    service.get.and.returnValue(
      of({
        pkid: 1, roleId: 'Admin', roleName: 'Administrator', permissionLevel: 1,
        description: '系統管理員', userCount: 2, userIds: ['helen', 'ghost'],
      }),
    );
    service.getUserLookups.and.returnValue(of([{ userId: 'helen', userName: 'Helen' }]));

    await TestBed.configureTestingModule({
      imports: [AppRoleDetail],
      providers: [
        { provide: AppRoleService, useValue: service },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'Admin' }) } } },
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();
  });

  it('loads the role by route id and renders its fields', () => {
    const fixture = TestBed.createComponent(AppRoleDetail);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;

    expect(service.get).toHaveBeenCalledWith('Admin');
    expect(text).toContain('Administrator');
    expect(text).toContain('系統管理員');
  });

  it('resolves user ids to names, falling back to the raw id', () => {
    const fixture = TestBed.createComponent(AppRoleDetail);
    fixture.detectChanges();

    expect(fixture.componentInstance.assignedUsers()).toEqual(['Helen (helen)', 'ghost']);
  });

  it('navigates to edit and back', () => {
    const fixture = TestBed.createComponent(AppRoleDetail);
    fixture.detectChanges();
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    fixture.componentInstance.edit();
    fixture.componentInstance.back();

    expect(navigate.calls.allArgs()).toEqual([[['/app-roles', 'Admin', 'edit']], [['/app-roles']]]);
  });
});
