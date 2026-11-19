import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { isApiUrl, isPublicAuthUrl } from '../api/api-paths';
import { AuthService } from './auth.service';

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/**
 * Adds the access token to API calls. When the API answers 401 the token is
 * refreshed once and the request is sent again; requests made while a refresh
 * is running wait for it instead of failing with the old token.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiUrl(req.url) || isPublicAuthUrl(req.url)) {
    return next(req);
  }
  const auth = inject(AuthService);
  const pending = auth.pendingRefresh();
  const firstTry = pending
    ? pending.pipe(switchMap((token) => next(withToken(req, token))))
    : next(withToken(req, auth.currentAccessToken()));

  return firstTry.pipe(
    catchError((error: unknown) => {
      const expired = error instanceof HttpErrorResponse && error.status === 401;
      if (!expired || pending) {
        return throwError(() => error);
      }
      return auth.refresh().pipe(
        catchError(() => throwError(() => error)),
        switchMap((token) => next(withToken(req, token))),
      );
    }),
  );
};
