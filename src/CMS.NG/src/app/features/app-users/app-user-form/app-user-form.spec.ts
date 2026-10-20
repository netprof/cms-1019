import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { signIn } from '@app/core/testing/auth';
import { AppRoleLookup, AppUser } from '../app-user.model';
import { AppUserService } from '../app-user.service';
import { expectStickyToolbar } from '../../../core/testing/sticky-toolbar';
import { AppUserForm } from './app-user-form';

const roles: AppRoleLookup[] = [
  { roleId: 'Admin', roleName: 'Administrator' },
  { roleId: 'User', roleName: 'User' },
];

const user: AppUser = {
  pkid: 7, userId: 'helen', userName: 'Helen', isActive: false,
  passwordUpdatedTime: '2026-01-10T08:00:00', roleCount: 1, roleIds: ['Admin'],
};

describe('AppUserForm', () => {
  let service: jasmine.SpyObj<AppUserService>;
  let router: Router;

  /** Signed in with <signedInRoles> (Admin by default): the reset button depends on them. */
  async function setup(id: string | null, signedInRoles = ['Admin']): Promise<ComponentFixture<AppUserForm>> {
    sessionStorage.clear();
    signIn(signedInRoles);
    service = jasmine.createSpyObj<AppUserService>('AppUserService', ['get', 'create', 'update', 'getRoleLookups']);
    service.getRoleLookups.and.returnValue(of(roles));
    service.get.and.returnValue(of(user));
    service.create.and.returnValue(of(user));
    service.update.and.returnValue(of(user));

    await TestBed.configureTestingModule({
      imports: [AppUserForm],
      providers: [
        { provide: AppUserService, useValue: service },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } } },
        provideNoopAnimations(),
        provideHttpClient(),
        ConfirmationService,
        MessageService,
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    const fixture = TestBed.createComponent(AppUserForm);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => sessionStorage.clear());

  const resetButton = (fixture: ComponentFixture<AppUserForm>) =>
    (fixture.nativeElement as HTMLElement).querySelector('#form-toolbar #reset-password-button');

  it('shows 重設為預設密碼 in the edit toolbar for Admin users', async () => {
    const button = resetButton(await setup('helen', ['User', 'Admin']));

    expect(button).not.toBeNull();
    expect(button!.textContent).toContain('重設為預設密碼');
    expect(button!.querySelector('button')!.getAttribute('type')).toBe('button'); // never submits the form
  });

  it('hides 重設為預設密碼 from users without the Admin role', async () => {
    expect(resetButton(await setup('helen', ['User']))).toBeNull();
  });

  it('has no 重設為預設密碼 when adding a user', async () => {
    expect(resetButton(await setup(null, ['Admin']))).toBeNull();
  });

  it('pins the Save/Cancel toolbar to the top of the page when adding', async () => {
    expectStickyToolbar((await setup(null)).nativeElement);
  });

  it('pins the Save/Cancel toolbar to the top of the page when editing', async () => {
    expectStickyToolbar((await setup('helen')).nativeElement);
  });

  describe('add', () => {
    let fixture: ComponentFixture<AppUserForm>;
    let component: AppUserForm;

    beforeEach(async () => {
      fixture = await setup(null);
      component = fixture.componentInstance;
    });

    it('starts active with lookups loaded and no password field', () => {
      expect(component.isEdit).toBeFalse();
      expect(component.form.getRawValue().isActive).toBeTrue();
      expect(Object.keys(component.form.controls)).not.toContain('passwordHash');
      expect(component.roleOptions).toEqual([
        { roleId: 'Admin', label: 'Administrator (Admin)' },
        { roleId: 'User', label: 'User (User)' },
      ]);
      expect(service.get).not.toHaveBeenCalled();
    });

    it('shows the default-password hint', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('#default-password-hint')?.textContent).toContain('系統預設密碼');
      expect(el.querySelector('#pkid')).toBeNull();
    });

    it('does not save an invalid form', () => {
      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(component.invalid('userId')).toBeTrue();
      expect(component.invalid('userName')).toBeTrue();
    });

    it('creates the user (trimmed, no password) and returns to the list', () => {
      component.form.patchValue({ userId: ' kevin ', userName: ' Kevin ', isActive: true, roleIds: ['User'] });

      component.save();

      expect(service.create).toHaveBeenCalledWith({
        userId: 'kevin', userName: 'Kevin', isActive: true, roleIds: ['User'],
      });
      expect(router.navigate).toHaveBeenCalledWith(['/app-users']);
    });

    it('stays on the page when the user id already exists (409)', () => {
      service.create.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
      component.form.patchValue({ userId: 'helen', userName: 'x' });

      component.save();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.saving()).toBeFalse();
    });
  });

  describe('edit', () => {
    let fixture: ComponentFixture<AppUserForm>;
    let component: AppUserForm;

    beforeEach(async () => {
      fixture = await setup('helen');
      component = fixture.componentInstance;
    });

    it('loads the user, shows the pkid read-only and locks the user id', () => {
      expect(component.isEdit).toBeTrue();
      expect(service.get).toHaveBeenCalledWith('helen');
      expect(component.pkid()).toBe(7);
      expect(component.form.controls.userId.disabled).toBeTrue();
      expect(component.form.getRawValue()).toEqual({
        userId: 'helen', userName: 'Helen', isActive: false, roleIds: ['Admin'],
      });
      expect((fixture.nativeElement as HTMLElement).querySelector('#default-password-hint')).toBeNull();
    });

    it('updates the user (key from the disabled control) and returns to the list', () => {
      component.form.patchValue({ userName: 'Helen Wang', isActive: true, roleIds: ['Admin', 'User'] });

      component.save();

      expect(service.update).toHaveBeenCalledWith({
        userId: 'helen', userName: 'Helen Wang', isActive: true, roleIds: ['Admin', 'User'],
      });
      expect(router.navigate).toHaveBeenCalledWith(['/app-users']);
    });

    it('cancel() returns to the list without saving', () => {
      component.cancel();

      expect(service.update).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/app-users']);
    });
  });
});
