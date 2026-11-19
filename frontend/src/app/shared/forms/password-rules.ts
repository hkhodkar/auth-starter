import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export interface PasswordCheck {
  label: string;
  passed: boolean;
}

export interface PasswordStrength {
  /** 0 (empty) to 4 (strong) */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  checks: PasswordCheck[];
}

const LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

export function passwordStrength(password: string): PasswordStrength {
  const checks: PasswordCheck[] = [
    { label: 'At least 8 characters', passed: password.length >= 8 },
    { label: 'A letter and a number', passed: /[a-z]/i.test(password) && /\d/.test(password) },
    { label: 'Upper and lower case', passed: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    {
      label: 'A symbol or 12+ characters',
      passed: /[^a-z0-9]/i.test(password) || password.length >= 12,
    },
  ];
  if (!password) {
    return { score: 0, label: '', checks };
  }
  const passed = checks.filter((c) => c.passed).length;
  // the API refuses anything without the first two, so never call that more than weak
  const score = (checks[0].passed && checks[1].passed ? Math.max(2, passed) : 1) as 1 | 2 | 3 | 4;
  return { score, label: LABELS[score], checks };
}

/** Same rules as the API: 8+ characters with at least one letter and one number. */
export const passwordRules: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = (control.value as string | null) ?? '';
  if (!value) return null;
  if (value.length < 8) return { passwordLength: true };
  if (!/[a-z]/i.test(value) || !/\d/.test(value)) return { passwordMix: true };
  return null;
};

/** Group validator that flags `confirmKey` when it differs from `key`. */
export function matchFields(key: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const confirm = group.get(confirmKey);
    const value = group.get(key)?.value;
    if (!confirm) return null;
    const mismatch = !!confirm.value && confirm.value !== value;
    const errors = { ...(confirm.errors ?? {}) };
    if (mismatch) errors['mismatch'] = true;
    else delete errors['mismatch'];
    confirm.setErrors(Object.keys(errors).length ? errors : null);
    return mismatch ? { mismatch: true } : null;
  };
}
