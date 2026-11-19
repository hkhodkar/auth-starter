import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { TokenPair } from '../models/auth.models';
import { DemoMode, MOCK_LATENCY, MOCK_STORAGE } from './demo-mode';
import { backendUnavailable, mockApiInterceptor } from './mock-api.interceptor';

describe('mockApiInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let demo: DemoMode;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([mockApiInterceptor])),
        provideHttpClientTesting(),
        { provide: MOCK_LATENCY, useValue: [0, 0] },
        { provide: MOCK_STORAGE, useValue: null },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    demo = TestBed.inject(DemoMode);
  });

  afterEach(() => backend.verify());

  it('uses the real API while it answers', async () => {
    const result = firstValueFrom(http.get('/api/health'));
    backend.expectOne('/api/health').flush({ status: 'ok' });
    expect(await result).toEqual({ status: 'ok' });
    expect(demo.active()).toBe(false);
  });

  it('switches to demo mode when there is no API', async () => {
    const result = firstValueFrom(
      http.post<TokenPair>('/api/auth/login', { email: 'user@demo.dev', password: 'demo1234' }),
    );
    backend.expectOne('/api/auth/login').error(new ProgressEvent('error'), { status: 0 });

    const tokens = await result;
    expect(tokens.user.email).toBe('user@demo.dev');
    expect(demo.active()).toBe(true);

    // later calls skip the network entirely
    const me = await firstValueFrom(
      http.get('/api/auth/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } }),
    );
    expect(me).toMatchObject({ email: 'user@demo.dev' });
    backend.expectNone('/api/auth/me');
  });

  it('answers mock errors as HttpErrorResponse with the FastAPI body', async () => {
    demo.enable();
    const error = await firstValueFrom(http.get('/api/users')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(401);
    expect((error as HttpErrorResponse).error).toEqual({ detail: 'Not authenticated' });
  });

  it('tells a missing backend apart from real API errors', () => {
    const json = new HttpHeaders({ 'content-type': 'application/json' });
    const html = new HttpHeaders({ 'content-type': 'text/html' });
    expect(backendUnavailable(new HttpErrorResponse({ status: 0 }))).toBe(true);
    expect(backendUnavailable(new HttpErrorResponse({ status: 404, headers: html }))).toBe(true);
    expect(backendUnavailable(new HttpErrorResponse({ status: 502 }))).toBe(true);
    // FastAPI answers JSON, so these are real errors to show the user
    expect(backendUnavailable(new HttpErrorResponse({ status: 404, headers: json }))).toBe(false);
    expect(backendUnavailable(new HttpErrorResponse({ status: 401, headers: json }))).toBe(false);
  });
});
