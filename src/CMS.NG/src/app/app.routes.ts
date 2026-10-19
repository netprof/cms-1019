import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app-roles' },
  {
    path: 'app-roles',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/app-roles/app-role-list/app-role-list').then((m) => m.AppRoleList),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/app-roles/app-role-form/app-role-form').then((m) => m.AppRoleForm),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/app-roles/app-role-form/app-role-form').then((m) => m.AppRoleForm),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/app-roles/app-role-detail/app-role-detail').then(
            (m) => m.AppRoleDetail,
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'app-roles' },
];
