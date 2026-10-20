import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { signIn } from '@app/core/testing/auth';
import { AppUserService } from '../app-user.service';
import { ResetPasswordButton } from './reset-password-button';

describe('ResetPasswordButton', () => {
  let service: jasmine.SpyObj<AppUserService>;
  let confirmation: ConfirmationService;
  let messages: MessageService;

  function setup(roles: string[]): ComponentFixture<ResetPasswordButton> {
    sessionStorage.clear();
    signIn(roles);
    service = jasmine.createSpyObj<AppUserService>('AppUserService', ['resetPassword']);
    service.resetPassword.and.returnValue(of(undefined));

    TestBed.configureTestingModule({
      imports: [ResetPasswordButton],
      providers: [
        { provide: AppUserService, useValue: service },
        provideRouter([]),
        provideHttpClient(),
        provideNoopAnimations(),
        ConfirmationService,
        MessageService,
      ],
    });
    confirmation = TestBed.inject(ConfirmationService);
    messages = TestBed.inject(MessageService);
    spyOn(messages, 'add');

    const fixture = TestBed.createComponent(ResetPasswordButton);
    fixture.componentRef.setInput('userId', 'jenny');
    fixture.detectChanges();
    return fixture;
  }

  const button = (fixture: ComponentFixture<ResetPasswordButton>) =>
    (fixture.nativeElement as HTMLElement).querySelector('#reset-password-button');

  /** Makes the next confirm() answer yes. */
  const acceptConfirm = () =>
    spyOn(confirmation, 'confirm').and.callFake((c) => {
      c.accept?.();
      return confirmation;
    });

  afterEach(() => sessionStorage.clear());

  it('shows the button to Admin users', () => {
    expect(button(setup(['User', 'Admin']))).not.toBeNull();
  });

  it('renders nothing for users without the Admin role', () => {
    const fixture = setup(['User']);

    expect(button(fixture)).toBeNull();
    expect((fixture.nativeElement as HTMLElement).innerHTML.trim()).not.toContain('p-confirmdialog');
  });

  it('asks for confirmation before resetting', () => {
    const fixture = setup(['Admin']);
    const confirm = spyOn(confirmation, 'confirm');

    fixture.componentInstance.confirmReset();

    expect(confirm).toHaveBeenCalledWith(jasmine.objectContaining({ key: 'reset-password' }));
    expect(service.resetPassword).not.toHaveBeenCalled();
  });

  it('on confirmation sends only the UserId, reports success and emits reset', () => {
    const fixture = setup(['Admin']);
    acceptConfirm();
    let emitted = false;
    fixture.componentInstance.reset.subscribe(() => (emitted = true));

    fixture.componentInstance.confirmReset();

    expect(service.resetPassword).toHaveBeenCalledOnceWith('jenny');
    expect(emitted).toBeTrue();
    expect(fixture.componentInstance.resetting()).toBeFalse();
    expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'success' }));
  });

  it('reports a 403 as missing permission and does not emit', () => {
    const fixture = setup(['Admin']);
    acceptConfirm();
    service.resetPassword.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    let emitted = false;
    fixture.componentInstance.reset.subscribe(() => (emitted = true));

    fixture.componentInstance.confirmReset();

    expect(emitted).toBeFalse();
    expect(messages.add).toHaveBeenCalledWith(
      jasmine.objectContaining({ severity: 'error', detail: '沒有權限重設密碼' }),
    );
  });
});
