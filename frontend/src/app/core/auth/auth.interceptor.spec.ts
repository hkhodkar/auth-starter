import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TokenPair, User } from '../models/auth.models';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { AUTH_STORAGE, TokenStorage } from './token-storage';

const user: User = {
  id: 1,
  email: 'ava@example.com',
  full_name: 'Ava Thompson',
  role: 'admin',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  last_login_at: null,
};

function pair(access: string, refresh: string): TokenPair {
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: 'bearer',
    expires_in: 900,
    user,
  };
}

const unauthorized = { status: 401, statusText: 'Unauthorized' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let tokens: TokenStorage;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AUTH_STORAGE, useValue: null },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStorage);
    router = TestBed.inject(Router);
    tokens.save('access-1', 'refresh-1');
  });

  afterEach(() => backend.verify());

  it('adds the access token to API calls only', () => {
    http.get('/api/users').subscribe();
    http.get('https://example.com/data').subscribe();
    http.post('/api/auth/login', {}).subscribe();

    expect(backend.expectOne('/api/users').request.headers.get('Authorization')).toBe(
      'Bearer access-1',
    );
    expect(backend.expectOne('https://example.com/data').request.headers.has('Authorization')).toBe(
      false,
    );
    expect(backend.expectOne('/api/auth/login').request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes on 401 and retries the request with the new token', () => {
    let body: unknown;
    http.get('/api/auth/me').subscribe((b) => (body = b));

    backend.expectOne('/api/auth/me').flush({ detail: 'Access token expired' }, unauthorized);

    const refresh = backend.expectOne('/api/auth/refresh');
    expect(refresh.request.body).toEqual({ refresh_token: 'refresh-1' });
    refresh.flush(pair('access-2', 'refresh-2'));

    const retry = backend.expectOne('/api/auth/me');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
    retry.flush(user);

    expect(body).toEqual(user);
    expect(tokens.accessToken).toBe('access-2');
    expect(tokens.refreshToken).toBe('refresh-2');
    expect(TestBed.inject(AuthService).refreshCount()).toBe(1);
  });

  it('runs a single refresh for concurrent 401s and retries all of them', () => {
    const done: string[] = [];
    http.get('/api/users').subscribe(() => done.push('users'));
    http.get('/api/users/stats').subscribe(() => done.push('stats'));

    backend.expectOne('/api/users').flush(null, unauthorized);
    backend.expectOne('/api/users/stats').flush(null, unauthorized);

    const refreshes = backend.match('/api/auth/refresh');
    expect(refreshes.length).toBe(1);
    refreshes[0].flush(pair('access-2', 'refresh-2'));

    for (const url of ['/api/users', '/api/users/stats']) {
      const retry = backend.expectOne(url);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
      retry.flush({});
    }
    expect(done.sort()).toEqual(['stats', 'users']);
  });

  it('holds requests made during a refresh until the new token arrives', () => {
    http.get('/api/auth/me').subscribe();
    backend.expectOne('/api/auth/me').flush(null, unauthorized);
    const refresh = backend.expectOne('/api/auth/refresh');

    http.get('/api/users').subscribe();
    backend.expectNone('/api/users');

    refresh.flush(pair('access-2', 'refresh-2'));
    backend.expectOne('/api/auth/me').flush(user);
    expect(backend.expectOne('/api/users').request.headers.get('Authorization')).toBe(
      'Bearer access-2',
    );
  });

  it('does not loop when the retried request is rejected again', () => {
    let error: HttpErrorResponse | undefined;
    http.get('/api/users').subscribe({ error: (e) => (error = e) });

    backend.expectOne('/api/users').flush(null, unauthorized);
    backend.expectOne('/api/auth/refresh').flush(pair('access-2', 'refresh-2'));
    backend.expectOne('/api/users').flush(null, unauthorized);

    backend.expectNone('/api/auth/refresh');
    expect(error?.status).toBe(401);
  });

  it('ends the session when the refresh token is rejected', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const auth = TestBed.inject(AuthService);
    auth.login({ email: user.email, password: 'secret123' }).subscribe();
    backend.expectOne('/api/auth/login').flush(pair('access-1', 'refresh-1'));
    expect(auth.isAuthenticated()).toBe(true);

    let error: HttpErrorResponse | undefined;
    http.get('/api/users').subscribe({ error: (e) => (error = e) });
    backend.expectOne('/api/users').flush(null, unauthorized);
    backend
      .expectOne('/api/auth/refresh')
      .flush({ detail: 'Refresh token has been revoked' }, unauthorized);

    expect(error?.status).toBe(401);
    expect(auth.isAuthenticated()).toBe(false);
    expect(tokens.refreshToken).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'expired', returnUrl: '/' },
    });
  });

  it('passes errors other than 401 straight through', () => {
    let error: HttpErrorResponse | undefined;
    http.get('/api/users').subscribe({ error: (e) => (error = e) });
    backend.expectOne('/api/users').flush(
      { detail: 'Admin role required' },
      {
        status: 403,
        statusText: 'Forbidden',
      },
    );

    backend.expectNone('/api/auth/refresh');
    expect(error?.status).toBe(403);
  });
});
