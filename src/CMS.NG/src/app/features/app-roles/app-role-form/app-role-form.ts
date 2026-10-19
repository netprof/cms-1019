import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToastModule } from 'primeng/toast';
import { AppRoleRequest, AppUserLookup } from '../app-role.model';
import { AppRoleService } from '../app-role.service';

@Component({
  selector: 'app-app-role-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    MultiSelectModule,
    ToastModule,
  ],
  templateUrl: './app-role-form.html',
  styles: `
    :host ::ng-deep .p-multiselect-label {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
  `,
})
export class AppRoleForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(AppRoleService);
  private readonly messages = inject(MessageService);

  readonly roleId = this.route.snapshot.paramMap.get('id');
  readonly isEdit = this.roleId !== null;
  readonly users = signal<AppUserLookup[]>([]);
  readonly saving = signal(false);
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    roleId: ['', [Validators.required, Validators.maxLength(200)]],
    roleName: ['', [Validators.required, Validators.maxLength(200)]],
    permissionLevel: [100, [Validators.required]],
    description: ['', [Validators.required, Validators.maxLength(400)]],
    userIds: [[] as string[]],
  });

  /** Lookup options mapped for p-multiselect. */
  get userOptions(): { userId: string; label: string }[] {
    return this.users().map((u) => ({ userId: u.userId, label: `${u.userName} (${u.userId})` }));
  }

  ngOnInit() {
    forkJoin({
      users: this.service.getUserLookups(),
      role: this.isEdit ? this.service.get(this.roleId!) : of(null),
    }).subscribe({
      next: ({ users, role }) => {
        this.users.set(users);
        if (role) {
          this.form.patchValue({
            roleId: role.roleId,
            roleName: role.roleName,
            permissionLevel: role.permissionLevel,
            description: role.description ?? '',
            userIds: role.userIds,
          });
        }
      },
      error: () => {
        this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入資料失敗' });
      },
    });

    if (this.isEdit) this.form.controls.roleId.disable();
  }

  invalid(name: 'roleId' | 'roleName' | 'permissionLevel' | 'description'): boolean {
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
    const request: AppRoleRequest = {
      roleId: value.roleId.trim(),
      roleName: value.roleName,
      permissionLevel: value.permissionLevel,
      description: value.description || null,
      userIds: value.userIds,
    };

    this.saving.set(true);
    const call = this.isEdit ? this.service.update(request) : this.service.create(request);
    call.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/app-roles']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const detail =
          err.status === 409 ? `角色代碼「${request.roleId}」已存在` : '儲存失敗，請稍後再試';
        this.messages.add({ severity: 'error', summary: '錯誤', detail });
      },
    });
  }

  cancel() {
    this.router.navigate(['/app-roles']);
  }
}
