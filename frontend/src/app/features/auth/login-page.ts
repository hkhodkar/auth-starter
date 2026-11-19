import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { DEMO_PASSWORD } from '../../core/mock/seed';
import { emailValidator, fieldError } from '../../shared/forms/field-error';
import { Icon } from '../../shared/ui/icon';

interface DemoAccount {
  role: string;
  email: string;
  description: string;
}

/** Only follow app-internal return URLs, never `//evil.com`. */
export function safeReturnUrl(url: string | undefined | null): string {
  return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/login')
    ? url
    : '/dashboard';
}

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.html',
  styleUrls: ['./auth-card.scss', './login-page.scss'],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly returnUrl = input<string>();
  readonly reason = input<string>();

  protected readonly demoPassword = DEMO_PASSWORD;
  protected readonly demoAccounts: DemoAccount[] = [
    { role: 'Admin', email: 'admin@demo.dev', description: 'Manages users and roles' },
    { role: 'User', email: 'user@demo.dev', description: 'Regular account' },
  ];

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, emailValidator]],
    password: ['', Validators.required],
  });

  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly notice = computed(() => {
    switch (this.reason()) {
      case 'expired':
        return 'Your session has expired. Please sign in again.';
      case 'reset':
        return 'The demo data was reset. Sign in with one of the demo accounts.';
      default:
        return null;
    }
  });

  protected errorFor(name: 'email' | 'password', label: string): string | null {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted())
      ? fieldError(control, label)
      : null;
  }

  protected togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  protected useAccount(account: DemoAccount): void {
    this.form.setValue({ email: account.email, password: this.demoPassword });
    this.error.set(null);
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl())),
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.busy.set(false);
      },
    });
  }
}
