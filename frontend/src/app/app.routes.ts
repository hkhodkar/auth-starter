import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: '',
    loadComponent: () => import('./layout/auth-layout').then((m) => m.AuthLayout),
    canActivate: [guestGuard],
    children: [
      {
        path: 'login',
        title: 'Sign in · Auth Starter',
        loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        title: 'Create account · Auth Starter',
        loadComponent: () => import('./features/auth/register-page').then((m) => m.RegisterPage),
      },
    ],
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      {
        path: 'dashboard',
        title: 'Dashboard · Auth Starter',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'profile',
        title: 'Profile · Auth Starter',
        loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
      },
      {
        path: 'admin/users',
        title: 'Users · Auth Starter',
        canActivate: [roleGuard('admin')],
        loadComponent: () => import('./features/admin/users-page').then((m) => m.UsersPage),
      },
      {
        path: 'forbidden',
        title: 'Access denied · Auth Starter',
        loadComponent: () =>
          import('./features/errors/forbidden-page').then((m) => m.ForbiddenPage),
      },
    ],
  },
  {
    path: '**',
    title: 'Page not found · Auth Starter',
    loadComponent: () => import('./features/errors/not-found-page').then((m) => m.NotFoundPage),
  },
];
