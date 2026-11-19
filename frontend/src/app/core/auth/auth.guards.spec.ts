import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Role } from '../models/auth.models';
import { authGuard, guestGuard, roleGuard } from './auth.guards';
import { AuthService } from './auth.service';

describe('route guards', () => {
  const role = signal<Role | null>(null);
  const fakeAuth = {
    isAuthenticated: computed(() => role() !== null),
    hasRole: (...roles: Role[]) => role() !== null && roles.includes(role()!),
  };

  beforeEach(() => {
    role.set(null);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: fakeAuth }],
    });
  });

  function run(guard: CanActivateFn, url = '/admin/users'): boolean | UrlTree {
    const state = { url } as RouterStateSnapshot;
    return TestBed.runInInjectionContext(
      () => guard({} as ActivatedRouteSnapshot, state) as boolean | UrlTree,
    );
  }

  function serialize(result: boolean | UrlTree): string | boolean {
    return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;
  }

  it('authGuard sends visitors to the login page with a return URL', () => {
    expect(serialize(run(authGuard, '/profile'))).toBe('/login?returnUrl=%2Fprofile');
    expect(serialize(run(authGuard, '/dashboard'))).toBe('/login');
    role.set('user');
    expect(run(authGuard)).toBe(true);
  });

  it('guestGuard keeps signed-in users out of the login page', () => {
    expect(run(guestGuard)).toBe(true);
    role.set('user');
    expect(serialize(run(guestGuard))).toBe('/dashboard');
  });

  it('roleGuard shows the 403 page to users without the role', () => {
    const adminOnly = roleGuard('admin');
    expect(serialize(run(adminOnly))).toBe('/login?returnUrl=%2Fadmin%2Fusers');

    role.set('user');
    expect(serialize(run(adminOnly))).toBe('/forbidden');

    role.set('admin');
    expect(run(adminOnly)).toBe(true);
  });

  it('roleGuard accepts any of several roles', () => {
    role.set('user');
    expect(run(roleGuard('admin', 'user'))).toBe(true);
  });
});
