import { AbstractControl, ValidationErrors, Validators } from '@angular/forms';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Angular's email check plus a dot in the domain, like the API. */
export function emailValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  return Validators.email(control) ?? (EMAIL.test(control.value) ? null : { email: true });
}

/** First validation message for a control, in plain words. */
export function fieldError(control: AbstractControl | null, label: string): string | null {
  const errors = control?.errors;
  if (!errors) return null;
  if (errors['required']) return `${label} is required`;
  if (errors['email']) return 'Enter a valid email address';
  if (errors['minlength']) {
    return `${label} must be at least ${errors['minlength'].requiredLength} characters`;
  }
  if (errors['maxlength']) {
    return `${label} must be at most ${errors['maxlength'].requiredLength} characters`;
  }
  if (errors['passwordLength']) return 'Use at least 8 characters';
  if (errors['passwordMix']) return 'Use at least one letter and one number';
  if (errors['mismatch']) return "Passwords don't match";
  if (errors['sameAsCurrent']) return 'Choose a password different from the current one';
  if (errors['whitespace']) return `${label} can't be blank`;
  return `${label} is invalid`;
}

/** Rejects values that are only spaces. */
export function notBlank(control: AbstractControl): ValidationErrors | null {
  const value = control.value as string | null;
  return value && !value.trim() ? { whitespace: true } : null;
}
