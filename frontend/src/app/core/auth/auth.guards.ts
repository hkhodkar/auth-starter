import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../models/auth.models';
import { AuthService } from './auth.service';

function toLogin(router: Router, url: string) {
  // the dashboard is where login goes anyway, so keep that URL clean
  const queryParams = url === '/dashboard' ? {} : { returnUrl: url };
  return router.createUrlTree(['/login'], { queryParams });
}

/** Lets signed-in users through, everyone else goes to the login page. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? true : toLogin(inject(Router), state.url);
};

/** Keeps signed-in users away from the login and register pages. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).createUrlTree(['/dashboard']) : true;
};

/** Only lets users with one of the given roles in, others see the 403 page. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) return toLogin(router, state.url);
    return auth.hasRole(...roles) ? true : router.createUrlTree(['/forbidden']);
  };
}
