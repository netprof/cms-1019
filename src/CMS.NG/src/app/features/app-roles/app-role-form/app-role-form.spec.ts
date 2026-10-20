import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AppRole, AppUserLookup } from '../app-role.model';
import { AppRoleService } from '../app-role.service';
import { expectStickyToolbar } from '../../../core/testing/sticky-toolbar';
import { AppRoleForm } from './app-role-form';
import { expectNoRowAuditBadge, expectRowAuditBadge, provideRowAuditStub } from '@app/core/testing/row-audit';

const users: AppUserLookup[] = [
  { userId: 'helen', userName: 'Helen' },
  { userId: 'jenny', userName: 'Jenny' },
];

const role: AppRole = {
  pkid: 1, roleId: 'Admin', roleName: 'Administrator', permissionLevel: 1,
  description: '系統管理員', userCount: 1, userIds: ['helen'],
};

describe('AppRoleForm', () => {
  let service: jasmine.SpyObj<AppRoleService>;
  let router: Router;

  async function setup(id: string | null): Promise<ComponentFixture<AppRoleForm>> {
    service = jasmine.createSpyObj<AppRoleService>('AppRoleService', ['get', 'create', 'update', 'getUserLookups']);
    service.getUserLookups.and.returnValue(of(users));
    service.get.and.returnValue(of(role));
    service.create.and.returnValue(of(role));
    service.update.and.returnValue(of(role));

    await TestBed.configureTestingModule({
      imports: [AppRoleForm],
      providers: [
        provideRowAuditStub(),
        { provide: AppRoleService, useValue: service },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } } },
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    const fixture = TestBed.createComponent(AppRoleForm);
    fixture.detectChanges();
    return fixture;
  }

  it('pins the Save/Cancel toolbar to the top of the page when adding', async () => {
    expectStickyToolbar((await setup(null)).nativeElement);
  });

  it('pins the Save/Cancel toolbar to the top of the page when editing', async () => {
    expectStickyToolbar((await setup('Admin')).nativeElement);
  });

  describe('add', () => {
    let component: AppRoleForm;

    beforeEach(async () => {
      component = (await setup(null)).componentInstance;
    });

    it('starts with permission level 100 and lookups loaded', () => {
      expect(component.isEdit).toBeFalse();
      expect(component.form.getRawValue().permissionLevel).toBe(100);
      expect(component.userOptions).toEqual([
        { userId: 'helen', label: 'Helen (helen)' },
        { userId: 'jenny', label: 'Jenny (jenny)' },
      ]);
      expect(service.get).not.toHaveBeenCalled();
    });

    it('does not save an invalid form', () => {
      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(component.invalid('roleId')).toBeTrue();
      expect(component.invalid('roleName')).toBeTrue();
    });

    it('creates the role and returns to the list', () => {
      component.form.patchValue({
        roleId: ' Editor ', roleName: 'Editor', permissionLevel: 50, description: 'Can edit', userIds: ['jenny'],
      });

      component.save();

      expect(service.create).toHaveBeenCalledWith({
        roleId: 'Editor', roleName: 'Editor', permissionLevel: 50, description: 'Can edit', userIds: ['jenny'],
      });
      expect(router.navigate).toHaveBeenCalledWith(['/app-roles']);
    });

    it('stays on the page when the role id already exists (409)', () => {
      service.create.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
      component.form.patchValue({ roleId: 'Admin', roleName: 'x', description: 'x' });

      component.save();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.saving()).toBeFalse();
    });
  });

  describe('edit', () => {
    let component: AppRoleForm;

    beforeEach(async () => {
      component = (await setup('Admin')).componentInstance;
    });

    it('loads the role and locks the role id', () => {
      expect(component.isEdit).toBeTrue();
      expect(service.get).toHaveBeenCalledWith('Admin');
      expect(component.form.controls.roleId.disabled).toBeTrue();
      expect(component.form.getRawValue()).toEqual({
        roleId: 'Admin', roleName: 'Administrator', permissionLevel: 1, description: '系統管理員', userIds: ['helen'],
      });
    });

    it('updates the role (key from the disabled control) and returns to the list', () => {
      component.form.patchValue({ roleName: 'Root' });

      component.save();

      expect(service.update).toHaveBeenCalledWith({
        roleId: 'Admin', roleName: 'Root', permissionLevel: 1, description: '系統管理員', userIds: ['helen'],
      });
      expect(router.navigate).toHaveBeenCalledWith(['/app-roles']);
    });

    it('cancel() returns to the list without saving', () => {
      component.cancel();

      expect(service.update).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/app-roles']);
    });
  });

  describe('異動紀錄 History badge', () => {
    it('is hidden when adding', async () => {
      await expectNoRowAuditBadge(await setup(null));
    });

    it('shows the history of the edited record', async () => {
      await expectRowAuditBadge(await setup('Admin'), 'AppRole', 1);
    });
  });
});
