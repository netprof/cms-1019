import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToastModule } from 'primeng/toast';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { AppRoleLookup, AppUserRequest } from '../app-user.model';
import { AppUserService } from '../app-user.service';

@Component({
  selector: 'app-app-user-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    ToastModule,
    ToggleSwitchModule,
  ],
  templateUrl: './app-user-form.html',
  styles: `
    :host ::ng-deep .p-multiselect-label {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
  `,
})
export class AppUserForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(AppUserService);
  private readonly messages = inject(MessageService);

  readonly userId = this.route.snapshot.paramMap.get('id');
  readonly isEdit = this.userId !== null;
  /** IDENTITY surrogate — only known in edit mode; shown read-only, never part of the form. */
  readonly pkid = signal<number | null>(null);
  readonly roles = signal<AppRoleLookup[]>([]);
  readonly saving = signal(false);
  readonly submitted = signal(false);

  // No password control: the server assigns the default password on create.
  readonly form = this.fb.nonNullable.group({
    userId: ['', [Validators.required, Validators.maxLength(200)]],
    userName: ['', [Validators.required, Validators.maxLength(200)]],
    isActive: [true],
    roleIds: [[] as string[]],
  });

  /** Lookup options mapped for p-multiselect. */
  get roleOptions(): { roleId: string; label: string }[] {
    return this.roles().map((r) => ({ roleId: r.roleId, label: `${r.roleName} (${r.roleId})` }));
  }

  ngOnInit() {
    forkJoin({
      roles: this.service.getRoleLookups(),
      user: this.isEdit ? this.service.get(this.userId!) : of(null),
    }).subscribe({
      next: ({ roles, user }) => {
        this.roles.set(roles);
        if (user) {
          this.pkid.set(user.pkid);
          this.form.patchValue({
            userId: user.userId,
            userName: user.userName,
            isActive: user.isActive,
            roleIds: user.roleIds,
          });
        }
      },
      error: () => {
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入資料失敗' });
      },
    });

    if (this.isEdit) this.form.controls.userId.disable();
  }

  invalid(name: 'userId' | 'userName'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  save() {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const request: AppUserRequest = {
      userId: value.userId.trim(),
      userName: value.userName.trim(),
      isActive: value.isActive,
      roleIds: value.roleIds,
    };

    this.saving.set(true);
    const call = this.isEdit ? this.service.update(request) : this.service.create(request);
    call.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/app-users']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const detail =
          err.status === 409 ? `帳號「${request.userId}」已存在` : '儲存失敗，請稍後再試';
        this.messages.add({ severity: 'error', summary: '錯誤', detail });
      },
    });
  }

  cancel() {
    this.router.navigate(['/app-users']);
  }
}
