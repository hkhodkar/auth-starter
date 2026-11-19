import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormGroupDirective,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { apiErrorMessage } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { emailValidator, fieldError, notBlank } from '../../shared/forms/field-error';
import { matchFields, passwordRules } from '../../shared/forms/password-rules';
import { PasswordStrengthMeter } from '../../shared/forms/password-strength';
import { Avatar } from '../../shared/ui/avatar';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';

function differentFromCurrent(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword');
  const same = !!next?.value && next.value === group.get('currentPassword')?.value;
  const errors = { ...(next?.errors ?? {}) };
  if (same) errors['sameAsCurrent'] = true;
  else delete errors['sameAsCurrent'];
  next?.setErrors(Object.keys(errors).length ? errors : null);
  return same ? { sameAsCurrent: true } : null;
}

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule, DatePipe, Avatar, Icon, PasswordStrengthMeter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly details = this.fb.group({
    fullName: [
      '',
      [Validators.required, notBlank, Validators.minLength(2), Validators.maxLength(100)],
    ],
    email: ['', [Validators.required, emailValidator]],
  });

  protected readonly passwords = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, passwordRules, Validators.maxLength(128)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: [matchFields('newPassword', 'confirmPassword'), differentFromCurrent] },
  );

  protected readonly newPassword = toSignal(this.passwords.controls.newPassword.valueChanges, {
    initialValue: '',
  });

  protected readonly savingDetails = signal(false);
  protected readonly detailsSubmitted = signal(false);
  protected readonly detailsError = signal<string | null>(null);

  protected readonly savingPassword = signal(false);
  protected readonly passwordSubmitted = signal(false);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly showPasswords = signal(false);

  constructor() {
    // fill the form with the signed-in user, until the user starts editing
    effect(() => {
      const user = this.auth.user();
      if (user && this.details.pristine) {
        this.details.setValue({ fullName: user.full_name, email: user.email });
      }
    });
  }

  protected detailsErrorFor(name: 'fullName' | 'email', label: string): string | null {
    const control = this.details.controls[name];
    return control.invalid && (control.touched || this.detailsSubmitted())
      ? fieldError(control, label)
      : null;
  }

  protected passwordErrorFor(
    name: 'currentPassword' | 'newPassword' | 'confirmPassword',
    label: string,
  ): string | null {
    const control = this.passwords.controls[name];
    return control.invalid && (control.touched || this.passwordSubmitted())
      ? fieldError(control, label)
      : null;
  }

  protected togglePasswords(): void {
    this.showPasswords.update((v) => !v);
  }

  protected resetDetails(): void {
    const user = this.auth.user();
    if (!user) return;
    this.details.reset({ fullName: user.full_name, email: user.email });
    this.detailsSubmitted.set(false);
    this.detailsError.set(null);
  }

  protected saveDetails(): void {
    this.detailsSubmitted.set(true);
    if (this.details.invalid || this.savingDetails()) {
      this.details.markAllAsTouched();
      return;
    }
    const { fullName, email } = this.details.getRawValue();
    this.savingDetails.set(true);
    this.detailsError.set(null);
    this.auth.updateProfile({ full_name: fullName.trim(), email }).subscribe({
      next: (user) => {
        this.savingDetails.set(false);
        this.details.reset({ fullName: user.full_name, email: user.email });
        this.detailsSubmitted.set(false);
        this.toast.success('Profile updated');
      },
      error: (err: unknown) => {
        this.savingDetails.set(false);
        this.detailsError.set(apiErrorMessage(err));
      },
    });
  }

  protected changePassword(form: FormGroupDirective): void {
    this.passwordSubmitted.set(true);
    if (this.passwords.invalid || this.savingPassword()) {
      this.passwords.markAllAsTouched();
      return;
    }
    const { currentPassword, newPassword } = this.passwords.getRawValue();
    this.savingPassword.set(true);
    this.passwordError.set(null);
    this.auth
      .changePassword({ current_password: currentPassword, new_password: newPassword })
      .subscribe({
        next: () => {
          this.savingPassword.set(false);
          this.passwordSubmitted.set(false);
          form.resetForm();
          this.toast.success('Password changed. Your other sessions were signed out.');
        },
        error: (err: unknown) => {
          this.savingPassword.set(false);
          this.passwordError.set(apiErrorMessage(err));
        },
      });
  }
}
