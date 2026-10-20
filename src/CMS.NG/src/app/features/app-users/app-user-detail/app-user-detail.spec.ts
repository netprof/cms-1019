import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AppUser } from '../app-user.model';
import { AppUserService } from '../app-user.service';
import { AppUserDetail } from './app-user-detail';

const user: AppUser = {
  pkid: 1, userId: 'helen', userName: 'Helen', isActive: true,
  passwordUpdatedTime: '2026-01-10T08:00:00', roleCount: 2, roleIds: ['Admin', 'ghost'],
};

describe('AppUserDetail', () => {
  let service: jasmine.SpyObj<AppUserService>;
  let confirmation: ConfirmationService;

  beforeEach(async () => {
    service = jasmine.createSpyObj<AppUserService>('AppUserService', ['get', 'getRoleLookups', 'resetPassword']);
    service.get.and.returnValue(of(user));
    service.getRoleLookups.and.returnValue(of([{ roleId: 'Admin', roleName: 'Administrator' }]));
    service.resetPassword.and.returnValue(of({ ...user, passwordUpdatedTime: '2026-10-20T01:02:03' }));

    await TestBed.configureTestingModule({
      imports: [AppUserDetail],
      providers: [
        { provide: AppUserService, useValue: service },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'helen' }) } } },
        provideNoopAnimations(),
        ConfirmationService,
        MessageService,
      ],
    }).compileComponents();

    confirmation = TestBed.inject(ConfirmationService);
  });

  it('loads the user by route id and renders its fields', () => {
    const fixture = TestBed.createComponent(AppUserDetail);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;

    expect(service.get).toHaveBeenCalledWith('helen');
    expect(text).toContain('Helen');
    expect(text).toContain('啟用');
    expect(text).toMatch(/2026-01-10 \d{2}:\d{2}/);
    expect(text).not.toContain('passwordHash');
  });

  it('resolves role ids to names, falling back to the raw id', () => {
    const fixture = TestBed.createComponent(AppUserDetail);
    fixture.detectChanges();

    expect(fixture.componentInstance.assignedRoles()).toEqual(['Administrator (Admin)', 'ghost']);
  });

  it('resetPassword() calls the API after confirmation and refreshes the record', () => {
    spyOn(confirmation, 'confirm').and.callFake((c) => {
      c.accept?.();
      return confirmation;
    });
    const fixture = TestBed.createComponent(AppUserDetail);
    fixture.detectChanges();

    fixture.componentInstance.resetPassword();
    fixture.detectChanges();

    expect(service.resetPassword).toHaveBeenCalledWith('helen');
    expect(fixture.componentInstance.user()!.passwordUpdatedTime).toBe('2026-10-20T01:02:03');
    expect(fixture.componentInstance.resetting()).toBeFalse();
  });

  it('resetPassword() does nothing when the confirmation is not accepted', () => {
    spyOn(confirmation, 'confirm');
    const fixture = TestBed.createComponent(AppUserDetail);
    fixture.detectChanges();

    fixture.componentInstance.resetPassword();

    expect(service.resetPassword).not.toHaveBeenCalled();
  });

  it('navigates to edit and back', () => {
    const fixture = TestBed.createComponent(AppUserDetail);
    fixture.detectChanges();
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    fixture.componentInstance.edit();
    fixture.componentInstance.back();

    expect(navigate.calls.allArgs()).toEqual([[['/app-users', 'helen', 'edit']], [['/app-users']]]);
  });
});
