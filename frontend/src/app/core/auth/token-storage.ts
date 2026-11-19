import { Injectable, InjectionToken, inject } from '@angular/core';

export const AUTH_STORAGE = new InjectionToken<Storage | null>('AUTH_STORAGE', {
  factory: () => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  },
});

const ACCESS_KEY = 'auth-starter.access-token';
const REFRESH_KEY = 'auth-starter.refresh-token';

/**
 * Keeps the token pair in localStorage so a reload or a second tab keeps the
 * session. Values are read on every call, so a rotation done by another tab
 * is picked up right away.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  private readonly storage = inject(AUTH_STORAGE);
  // fallback when the browser blocks storage
  private memory: Record<string, string | null> = {};

  get accessToken(): string | null {
    return this.read(ACCESS_KEY);
  }

  get refreshToken(): string | null {
    return this.read(REFRESH_KEY);
  }

  save(accessToken: string, refreshToken: string): void {
    this.write(ACCESS_KEY, accessToken);
    this.write(REFRESH_KEY, refreshToken);
  }

  clear(): void {
    this.write(ACCESS_KEY, null);
    this.write(REFRESH_KEY, null);
  }

  isRefreshKey(key: string | null): boolean {
    return key === REFRESH_KEY;
  }

  private read(key: string): string | null {
    try {
      return this.storage ? this.storage.getItem(key) : (this.memory[key] ?? null);
    } catch {
      return this.memory[key] ?? null;
    }
  }

  private write(key: string, value: string | null): void {
    this.memory[key] = value;
    try {
      if (value === null) this.storage?.removeItem(key);
      else this.storage?.setItem(key, value);
    } catch {
      // keep the in-memory copy
    }
  }
}
