import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app-roles' },
  {
    path: 'app-users',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/app-users/app-user-list/app-user-list').then((m) => m.AppUserList),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/app-users/app-user-form/app-user-form').then((m) => m.AppUserForm),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/app-users/app-user-form/app-user-form').then((m) => m.AppUserForm),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/app-users/app-user-detail/app-user-detail').then(
            (m) => m.AppUserDetail,
          ),
      },
    ],
  },
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
  {
    path: 'publish-statuses',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/publish-statuses/publish-status-list/publish-status-list').then(
            (m) => m.PublishStatusList,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/publish-statuses/publish-status-form/publish-status-form').then(
            (m) => m.PublishStatusForm,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/publish-statuses/publish-status-form/publish-status-form').then(
            (m) => m.PublishStatusForm,
          ),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/publish-statuses/publish-status-detail/publish-status-detail').then(
            (m) => m.PublishStatusDetail,
          ),
      },
    ],
  },
  {
    // Composite key (model, effectiveDate): detail/edit routes carry both parts.
    path: 'model-prices',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/model-prices/model-price-list/model-price-list').then(
            (m) => m.ModelPriceList,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/model-prices/model-price-form/model-price-form').then(
            (m) => m.ModelPriceForm,
          ),
      },
      {
        path: ':model/:date/edit',
        loadComponent: () =>
          import('./features/model-prices/model-price-form/model-price-form').then(
            (m) => m.ModelPriceForm,
          ),
      },
      {
        path: ':model/:date',
        loadComponent: () =>
          import('./features/model-prices/model-price-detail/model-price-detail').then(
            (m) => m.ModelPriceDetail,
          ),
      },
    ],
  },
  {
    path: 'partners',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/partners/partner-list/partner-list').then((m) => m.PartnerList),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/partners/partner-form/partner-form').then((m) => m.PartnerForm),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/partners/partner-form/partner-form').then((m) => m.PartnerForm),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/partners/partner-detail/partner-detail').then((m) => m.PartnerDetail),
      },
    ],
  },
  {
    path: 'course-groups',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/course-groups/course-group-list/course-group-list').then(
            (m) => m.CourseGroupList,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/course-groups/course-group-form/course-group-form').then(
            (m) => m.CourseGroupForm,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/course-groups/course-group-form/course-group-form').then(
            (m) => m.CourseGroupForm,
          ),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/course-groups/course-group-detail/course-group-detail').then(
            (m) => m.CourseGroupDetail,
          ),
      },
    ],
  },
  {
    path: 'courses',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/courses/course-list/course-list').then((m) => m.CourseList),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/courses/course-form/course-form').then((m) => m.CourseForm),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/courses/course-form/course-form').then((m) => m.CourseForm),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/courses/course-detail/course-detail').then((m) => m.CourseDetail),
      },
    ],
  },
  {
    // Single page: Edit / New are inline forms on the list (see spec/custom/FeaturedPromoItem).
    path: 'featured-promo-items',
    loadComponent: () =>
      import('./features/featured-promo-items/featured-promo-item-list/featured-promo-item-list').then(
        (m) => m.FeaturedPromoItemList,
      ),
  },
  { path: '**', redirectTo: 'app-roles' },
];
