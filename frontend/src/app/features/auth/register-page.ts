import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { emailValidator, fieldError, notBlank } from '../../shared/forms/field-error';
import { matchFields, passwordRules } from '../../shared/forms/password-rules';
import { PasswordStrengthMeter } from '../../shared/forms/password-strength';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';

type Field = 'fullName' | 'email' | 'password' | 'confirmPassword';

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, Icon, PasswordStrengthMeter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register-page.html',
  styleUrl: './auth-card.scss',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      fullName: [
        '',
        [Validators.required, notBlank, Validators.minLength(2), Validators.maxLength(100)],
      ],
      email: ['', [Validators.required, emailValidator]],
      password: ['', [Validators.required, passwordRules, Validators.maxLength(128)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchFields('password', 'confirmPassword') },
  );

  protected readonly password = toSignal(this.form.controls.password.valueChanges, {
    initialValue: '',
  });
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected errorFor(name: Field, label: string): string | null {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted())
      ? fieldError(control, label)
      : null;
  }

  protected togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    const { fullName, email, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.auth.register({ full_name: fullName.trim(), email, password }).subscribe({
      next: (user) => {
        this.toast.success(`Welcome, ${user.full_name.split(' ')[0]}! Your account is ready.`);
        void this.router.navigateByUrl('/dashboard');
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.busy.set(false);
      },
    });
  }
}
