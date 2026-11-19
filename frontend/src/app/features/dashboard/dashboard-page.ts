import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-error';
import { UsersApi } from '../../core/api/users.api';
import { decodeJwt } from '../../core/auth/jwt';
import { AuthService } from '../../core/auth/auth.service';
import { Role, UserStats } from '../../core/models/auth.models';
import { HasRole } from '../../shared/directives/has-role';
import { formatCountdown, timeAgo } from '../../shared/utils/format';
import { Icon, IconName } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';

interface Permission {
  label: string;
  icon: IconName;
  roles: Role[];
}

const PERMISSIONS: Permission[] = [
  { label: 'View the dashboard', icon: 'dashboard', roles: ['admin', 'user'] },
  { label: 'Edit your profile', icon: 'user', roles: ['admin', 'user'] },
  { label: 'Change your password', icon: 'key', roles: ['admin', 'user'] },
  { label: 'See all users', icon: 'users', roles: ['admin'] },
  { label: 'Change user roles', icon: 'shield', roles: ['admin'] },
  { label: 'Deactivate accounts', icon: 'user-x', roles: ['admin'] },
];

const FLOW = [
  {
    title: 'Sign in',
    text: 'The API checks the Argon2 hash and returns a short-lived access token and a refresh token.',
  },
  {
    title: 'Call the API',
    text: 'A functional HTTP interceptor adds the access token as a Bearer header.',
  },
  {
    title: 'Token expires',
    text: 'On a 401 the interceptor refreshes once; requests that fail meanwhile wait in a queue and retry.',
  },
  {
    title: 'Rotation',
    text: 'Each refresh token works once. Presenting a used one revokes the whole session.',
  },
  {
    title: 'Sign out',
    text: 'Logout revokes the refresh token on the server, so it cannot be used again.',
  },
];

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, DatePipe, JsonPipe, Icon, HasRole],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  protected readonly auth = inject(AuthService);
  private readonly usersApi = inject(UsersApi);
  private readonly toast = inject(ToastService);

  protected readonly flow = FLOW;
  protected readonly now = signal(Date.now());
  protected readonly stats = signal<UserStats | null>(null);
  protected readonly statsError = signal<string | null>(null);
  protected readonly refreshing = signal(false);
  protected readonly showClaims = signal(false);

  protected readonly firstName = computed(() => this.auth.user()?.full_name.split(' ')[0] ?? '');
  protected readonly greeting = computed(() => {
    const hour = new Date(this.now()).getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  });

  protected readonly token = computed(() => decodeJwt(this.auth.accessToken()));
  protected readonly lifetime = computed(() => {
    const claims = this.token()?.claims;
    return claims?.exp && claims.iat ? claims.exp - claims.iat : null;
  });
  protected readonly secondsLeft = computed(() => {
    const expires = this.auth.accessTokenExpiresAt();
    return expires === null ? 0 : Math.max(0, Math.round((expires - this.now()) / 1000));
  });
  protected readonly countdown = computed(() => formatCountdown(this.secondsLeft()));
  protected readonly progress = computed(() => {
    const total = this.lifetime();
    return total ? Math.min(100, (this.secondsLeft() / total) * 100) : 0;
  });
  protected readonly expired = computed(() => this.secondsLeft() === 0);

  protected readonly permissions = computed(() => {
    const role = this.auth.role();
    return PERMISSIONS.map((p) => ({ ...p, allowed: role !== null && p.roles.includes(role) }));
  });

  protected readonly memberSince = computed(() => this.auth.user()?.created_at ?? null);
  protected readonly lastLogin = computed(() => timeAgo(this.auth.user()?.last_login_at ?? null));

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // an API call on load also renews an expired access token behind the scenes
    this.auth.reloadUser().subscribe({ error: () => undefined });
    if (this.auth.isAdmin()) {
      this.usersApi.stats().subscribe({
        next: (stats) => this.stats.set(stats),
        error: (err: unknown) => this.statsError.set(apiErrorMessage(err)),
      });
    }
  }

  protected toggleClaims(): void {
    this.showClaims.update((v) => !v);
  }

  protected refreshNow(): void {
    this.refreshing.set(true);
    this.auth.refresh().subscribe({
      next: () => {
        this.refreshing.set(false);
        this.toast.success('New access token issued and refresh token rotated');
      },
      error: (err: unknown) => {
        this.refreshing.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not refresh the session'));
      },
    });
  }
}
