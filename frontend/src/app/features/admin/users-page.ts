import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { apiErrorMessage } from '../../core/api/api-error';
import { UsersApi } from '../../core/api/users.api';
import { AuthService } from '../../core/auth/auth.service';
import { Page, Role, User, UserQuery, UserStatus } from '../../core/models/auth.models';
import { timeAgo } from '../../shared/utils/format';
import { Avatar } from '../../shared/ui/avatar';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { Icon } from '../../shared/ui/icon';
import { Pagination } from '../../shared/ui/pagination';
import { SortHeader } from '../../shared/ui/sort-header';
import { ToastService } from '../../shared/ui/toast.service';

interface PendingChange {
  user: User;
  changes: { role?: Role; is_active?: boolean };
  title: string;
  message: string;
  confirmLabel: string;
  success: string;
}

const PAGE_SIZE = 8;

// the column headers sort on wide screens, phones get this list instead
const SORT_OPTIONS = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
  { value: 'full_name', label: 'Name A–Z' },
  { value: '-full_name', label: 'Name Z–A' },
  { value: '-last_login_at', label: 'Recently active' },
  { value: 'last_login_at', label: 'Least recently active' },
];

@Component({
  selector: 'app-users-page',
  imports: [DatePipe, Avatar, ConfirmDialog, Icon, Pagination, SortHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-page.html',
  styleUrl: './users-page.scss',
})
export class UsersPage {
  private readonly api = inject(UsersApi);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  protected readonly search = signal('');
  protected readonly role = signal<Role | ''>('');
  protected readonly status = signal<UserStatus | ''>('');
  protected readonly sort = signal('-created_at');
  protected readonly page = signal(1);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly sortOptions = SORT_OPTIONS;

  protected readonly result = signal<Page<User> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly pending = signal<PendingChange | null>(null);
  protected readonly saving = signal(false);

  private readonly searchTerm = toSignal(
    toObservable(this.search).pipe(debounceTime(250), distinctUntilChanged()),
    { initialValue: '' },
  );

  private readonly query = computed<UserQuery>(() => ({
    search: this.searchTerm().trim() || null,
    role: this.role() || null,
    status: this.status() || null,
    sort: this.sort(),
    page: this.page(),
    page_size: PAGE_SIZE,
  }));

  private readonly reload$ = new Subject<void>();

  protected readonly hasFilters = computed(
    () => !!(this.search().trim() || this.role() || this.status()),
  );

  constructor() {
    toObservable(this.query)
      .pipe(
        switchMap((query) =>
          this.reload$.pipe(
            startWith(undefined),
            tap(() => this.loading.set(true)),
            switchMap(() =>
              this.api.list(query).pipe(
                catchError((err: unknown) => {
                  this.error.set(apiErrorMessage(err, 'Could not load users'));
                  return of(null);
                }),
              ),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        this.loading.set(false);
        if (page) {
          this.error.set(null);
          this.result.set(page);
        }
      });
  }

  protected isSelf(user: User): boolean {
    return user.id === this.auth.user()?.id;
  }

  protected lastSeen(user: User): string {
    return timeAgo(user.last_login_at);
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  protected onRole(event: Event): void {
    this.role.set((event.target as HTMLSelectElement).value as Role | '');
    this.page.set(1);
  }

  protected onStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as UserStatus | '');
    this.page.set(1);
  }

  protected onSort(sort: string): void {
    this.sort.set(sort);
    this.page.set(1);
  }

  protected onSortSelect(event: Event): void {
    this.onSort((event.target as HTMLSelectElement).value);
  }

  protected onPage(page: number): void {
    this.page.set(page);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.role.set('');
    this.status.set('');
    this.page.set(1);
  }

  protected askRoleChange(user: User): void {
    const role: Role = user.role === 'admin' ? 'user' : 'admin';
    this.pending.set({
      user,
      changes: { role },
      title: role === 'admin' ? 'Make this user an admin?' : 'Remove admin rights?',
      message:
        role === 'admin'
          ? `${user.full_name} will be able to see all users, change roles and deactivate accounts.`
          : `${user.full_name} will lose access to the admin pages right away.`,
      confirmLabel: role === 'admin' ? 'Make admin' : 'Make regular user',
      success: `${user.full_name} is now ${role === 'admin' ? 'an admin' : 'a regular user'}`,
    });
  }

  protected askStatusChange(user: User): void {
    const activate = !user.is_active;
    this.pending.set({
      user,
      changes: { is_active: activate },
      title: activate ? 'Activate this account?' : 'Deactivate this account?',
      message: activate
        ? `${user.full_name} will be able to sign in again.`
        : `${user.full_name} is signed out everywhere and can't sign in until reactivated.`,
      confirmLabel: activate ? 'Activate' : 'Deactivate',
      success: `${user.full_name} was ${activate ? 'activated' : 'deactivated'}`,
    });
  }

  protected cancelChange(): void {
    this.pending.set(null);
  }

  protected confirmChange(): void {
    const change = this.pending();
    if (!change || this.saving()) return;
    this.saving.set(true);
    this.api.update(change.user.id, change.changes).subscribe({
      next: () => {
        this.saving.set(false);
        this.pending.set(null);
        this.toast.success(change.success);
        this.reload$.next();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.pending.set(null);
        this.toast.error(apiErrorMessage(err));
      },
    });
  }
}
