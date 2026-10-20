import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { App } from '@app/app';
import { AUTH_STORAGE_KEY, CHANGE_PASSWORD_URL, PROFILE_URL } from '@app/core/auth/auth.service';
import { PASSWORD_MISMATCH_MESSAGE, PASSWORD_POLICY_MESSAGE } from '@app/core/auth/password-policy';
import { signIn } from '@app/core/testing/auth';
import { expectStickyToolbar } from '@app/core/testing/sticky-toolbar';
import { MyProfile } from './my-profile';

describe('MyProfile', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [MyProfile, App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        MessageService,
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MyProfile);
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement;
  const input = (fixture: { nativeElement: HTMLElement }, id: string) =>
    el(fixture).querySelector(`#${id}`) as HTMLInputElement;

  beforeEach(() => {
    sessionStorage.clear();
    signIn(['Admin', 'User'], 'Helen');
  });
  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('shows UserId read-only, UserName editable and the roles as display-only tags', () => {
    const fixture = setup();

    expect(input(fixture, 'userId').value).toBe('helen');
    expect(input(fixture, 'userId').disabled).toBeTrue();
    expect(input(fixture, 'userId').readOnly).toBeTrue();
    expect(input(fixture, 'userName').value).toBe('Helen');
    expect(input(fixture, 'userName').disabled).toBeFalse();

    const roles = el(fixture).querySelector('#roles')!;
    expect(roles.textContent).toContain('Admin');
    expect(roles.textContent).toContain('User');
    expect(roles.querySelector('input, select, p-multiselect, p-select')).toBeNull();
    expect(Object.keys(fixture.componentInstance.form.controls)).toEqual(['userName']);
  });

  it('pins the Save/Cancel toolbar', () => {
    expectStickyToolbar(el(setup()));
  });

  it('saving PUTs only the trimmed UserName and refreshes the shell and session storage', () => {
    const fixture = setup();
    const app = TestBed.createComponent(App);
    app.detectChanges();
    expect(app.nativeElement.querySelector('#signed-in-user').textContent).toContain('Helen');

    fixture.componentInstance.form.setValue({ userName: '  Helen Wang  ' });
    fixture.componentInstance.save();
    const req = http.expectOne(PROFILE_URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ userName: 'Helen Wang' });
    req.flush({ userId: 'helen', userName: 'Helen Wang' });
    app.detectChanges();

    expect(app.nativeElement.querySelector('#signed-in-user').textContent).toContain('Helen Wang');
    const stored = JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY)!);
    expect(stored.userName).toBe('Helen Wang');
    expect(stored.userId).toBe('helen');
    expect(stored.accessToken).toBeTruthy();
  });

  it('does not save a blank UserName', () => {
    const fixture = setup();

    fixture.componentInstance.form.setValue({ userName: '   ' });
    fixture.componentInstance.save();
    fixture.detectChanges();

    http.expectNone(PROFILE_URL);
    expect(el(fixture).textContent).toContain('請輸入名稱');
  });

  it('keeps the old name everywhere when saving fails', () => {
    const fixture = setup();

    fixture.componentInstance.form.setValue({ userName: 'New' });
    fixture.componentInstance.save();
    http.expectOne(PROFILE_URL).flush(null, { status: 500, statusText: 'Server Error' });

    expect(JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY)!).userName).toBe('Helen');
    expect(fixture.componentInstance.saving()).toBeFalse();
  });

  it('cancel goes back to the home route', () => {
    const fixture = setup();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    fixture.componentInstance.cancel();

    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  describe('change password', () => {
    const VALID = 'NewPass#2026';
    const errorText = (fixture: { nativeElement: HTMLElement }, field: string) =>
      el(fixture).querySelector(`#${field}-error`)?.textContent?.trim() ?? null;

    function fill(fixture: ReturnType<typeof setup>, current: string, next: string, confirm: string) {
      fixture.componentInstance.passwordForm.setValue({
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      });
    }

    function submit(fixture: ReturnType<typeof setup>) {
      fixture.componentInstance.changePassword();
      fixture.detectChanges();
    }

    it('requires all three fields and sends nothing', () => {
      const fixture = setup();

      submit(fixture);

      http.expectNone(CHANGE_PASSWORD_URL);
      expect(errorText(fixture, 'currentPassword')).toBe('請輸入目前密碼');
      expect(errorText(fixture, 'newPassword')).toBe('請輸入新密碼');
      expect(errorText(fixture, 'confirmPassword')).toBe('請再次輸入新密碼');
    });

    for (const weak of ['Ab1#xyz', 'abcdefgh', 'abcdefg1', 'ABCDEFG#']) {
      it(`rejects "${weak}" with the bilingual complexity message`, () => {
        const fixture = setup();
        fill(fixture, 'Secret#1', weak, weak);

        submit(fixture);

        http.expectNone(CHANGE_PASSWORD_URL);
        expect(errorText(fixture, 'newPassword')).toBe(PASSWORD_POLICY_MESSAGE);
        expect(PASSWORD_POLICY_MESSAGE).toContain('密碼長度至少需 8 碼，且內容須至少包含四種字元的其中三種');
        expect(PASSWORD_POLICY_MESSAGE).toContain('Password must be at least 8 characters');
      });
    }

    it('rejects a confirmation that differs from the new password', () => {
      const fixture = setup();
      fill(fixture, 'Secret#1', VALID, VALID + 'x');

      submit(fixture);

      http.expectNone(CHANGE_PASSWORD_URL);
      expect(errorText(fixture, 'confirmPassword')).toBe(PASSWORD_MISMATCH_MESSAGE);
      expect(errorText(fixture, 'newPassword')).toBeNull();
    });

    it('shows the policy as a hint until there is an error', () => {
      const fixture = setup();

      expect(el(fixture).querySelector('#password-form .hint')?.textContent).toContain('密碼長度至少需 8 碼');
      expect(errorText(fixture, 'newPassword')).toBeNull();
    });

    it('posts exactly the three plain passwords, then clears the form', () => {
      const fixture = setup();
      fill(fixture, 'Secret#1', VALID, VALID);

      submit(fixture);
      const req = http.expectOne(CHANGE_PASSWORD_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ currentPassword: 'Secret#1', newPassword: VALID, confirmPassword: VALID });
      req.flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();

      expect(fixture.componentInstance.passwordForm.getRawValue()).toEqual({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      expect(errorText(fixture, 'currentPassword')).toBeNull();
      expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).not.toBeNull(); // still signed in
    });

    it('shows the API field errors (e.g. a wrong current password) until the field is edited', () => {
      const fixture = setup();
      fill(fixture, 'wrong-one', VALID, VALID);

      submit(fixture);
      http.expectOne(CHANGE_PASSWORD_URL).flush(
        { errors: { CurrentPassword: ['目前密碼不正確 (Current password is incorrect.)'] } },
        { status: 400, statusText: 'Bad Request' },
      );
      fixture.detectChanges();
      expect(errorText(fixture, 'currentPassword')).toContain('目前密碼不正確');

      fixture.componentInstance.passwordForm.controls.currentPassword.setValue('Secret#1');
      fixture.detectChanges();
      expect(errorText(fixture, 'currentPassword')).toBeNull();
    });
  });
});
