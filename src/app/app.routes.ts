import { Routes } from '@angular/router';

import { anonymousGuard, authenticatedGuard } from './core/auth/authentication.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [anonymousGuard],
    loadComponent: () =>
      import('./features/auth/login-page/login-page').then((module) => module.LoginPage),
  },
  {
    path: 'register',
    canActivate: [anonymousGuard],
    loadComponent: () =>
      import('./features/auth/register-page/register-page').then((module) => module.RegisterPage),
  },
  {
    path: 'forms',
    canActivate: [authenticatedGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/forms-home/forms-home-page').then((module) => module.FormsHomePage),
      },
      {
        path: ':formId',
        loadComponent: () =>
          import('./features/form-viewer/pages/form-viewer-page/form-viewer-page').then(
            (module) => module.FormViewerPage,
          ),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'forms' },
  { path: '**', redirectTo: 'forms' },
];
