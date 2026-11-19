import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  map,
  of,
  shareReplay,
  tap,
  throwError,
} from 'rxjs';
import {
  LoginRequest,
  PasswordChange,
  ProfileUpdate,
  RegisterRequest,
  Role,
  TokenPair,
  User,
} from '../models/auth.models';
import { tokenExpiry } from './jwt';
import { TokenStorage } from './token-storage';

export type SessionEndReason = 'expired' | 'signed-out' | 'reset';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly tokens = inject(TokenStorage);

  private readonly currentUser = signal<User | null>(null);
  private readonly access = signal<string | null>(this.tokens.accessToken);
  private refreshInFlight: Observable<string> | null = null;

  readonly user = this.currentUser.asReadonly();
  readonly accessToken = this.access.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly role = computed(() => this.currentUser()?.role ?? null);
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly accessTokenExpiresAt = computed(() => tokenExpiry(this.access()));
  /** how many times the access token was renewed in this tab */
  readonly refreshCount = signal(0);

  constructor() {
    // follow sign-outs and token rotations from other tabs
    const onStorage = (event: StorageEvent) => {
      if (!this.tokens.isRefreshKey(event.key)) return;
      if (event.newValue === null && this.currentUser()) {
        this.endSession('signed-out');
      } else {
        this.access.set(this.tokens.accessToken);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
      inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', onStorage));
    }
  }

  hasRole(...roles: Role[]): boolean {
    const role = this.role();
    return role !== null && roles.includes(role);
  }

  /** Token to send right now. Read from storage so other tabs' rotations count. */
  currentAccessToken(): string | null {
    return this.tokens.accessToken;
  }

  /** The refresh call that is running, if any, so new requests can wait for it. */
  pendingRefresh(): Observable<string> | null {
    return this.refreshInFlight;
  }

  /** Restores the session on startup. Never fails, a bad session just ends up signed out. */
  restoreSession(): Promise<void> {
    if (!this.tokens.refreshToken) return Promise.resolve();
    return firstValueFrom(
      this.http.get<User>('/api/auth/me').pipe(
        tap((user) => this.currentUser.set(user)),
        map(() => undefined),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 401) {
            this.clearSession();
          }
          return of(undefined);
        }),
      ),
    );
  }

  login(request: LoginRequest): Observable<User> {
    return this.http.post<TokenPair>('/api/auth/login', request).pipe(map((p) => this.start(p)));
  }

  register(request: RegisterRequest): Observable<User> {
    return this.http.post<TokenPair>('/api/auth/register', request).pipe(map((p) => this.start(p)));
  }

  /**
   * Swaps the refresh token for a new pair. Concurrent callers share one
   * request, so a burst of 401s still rotates the token only once.
   */
  refresh(): Observable<string> {
    if (this.refreshInFlight) return this.refreshInFlight;

    const refreshToken = this.tokens.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token'));
    }
    this.refreshInFlight = this.http
      .post<TokenPair>('/api/auth/refresh', { refresh_token: refreshToken })
      .pipe(
        map((pair) => {
          this.start(pair);
          this.refreshCount.update((n) => n + 1);
          return pair.access_token;
        }),
        catchError((error: unknown) => {
          // the API rejected the refresh token: this session is over
          if (error instanceof HttpErrorResponse && error.status === 401) {
            this.endSession('expired');
          }
          return throwError(() => error);
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.refreshInFlight;
  }

  logout(): Observable<void> {
    const refreshToken = this.tokens.refreshToken;
    const request = refreshToken
      ? this.http.post<void>('/api/auth/logout', { refresh_token: refreshToken })
      : of(undefined);
    return request.pipe(
      catchError(() => of(undefined)),
      map(() => undefined),
      finalize(() => this.endSession('signed-out')),
    );
  }

  updateProfile(changes: ProfileUpdate): Observable<User> {
    return this.http
      .patch<User>('/api/auth/me', changes)
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  /** The API signs out other sessions and returns a new pair for this one. */
  changePassword(change: PasswordChange): Observable<User> {
    return this.http
      .post<TokenPair>('/api/auth/me/password', change)
      .pipe(map((pair) => this.start(pair)));
  }

  reloadUser(): Observable<User> {
    return this.http.get<User>('/api/auth/me').pipe(tap((user) => this.currentUser.set(user)));
  }

  /** Forgets the session and sends the user to the login page. */
  endSession(reason: SessionEndReason): void {
    const wasSignedIn = this.currentUser() !== null;
    const returnUrl = this.router.url;
    this.clearSession();
    if (reason === 'expired') {
      // before sign-in (e.g. on startup) the guards take care of redirecting
      if (wasSignedIn) {
        void this.router.navigate(['/login'], { queryParams: { reason, returnUrl } });
      }
      return;
    }
    void this.router.navigate(['/login'], reason === 'reset' ? { queryParams: { reason } } : {});
  }

  private start(pair: TokenPair): User {
    this.tokens.save(pair.access_token, pair.refresh_token);
    this.access.set(pair.access_token);
    this.currentUser.set(pair.user);
    return pair.user;
  }

  private clearSession(): void {
    this.tokens.clear();
    this.access.set(null);
    this.currentUser.set(null);
  }
}
