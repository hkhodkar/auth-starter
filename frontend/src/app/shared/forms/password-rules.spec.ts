import { FormControl, FormGroup } from '@angular/forms';
import { matchFields, passwordRules, passwordStrength } from './password-rules';

describe('password rules', () => {
  it('scores password strength', () => {
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('abcdefgh').label).toBe('Weak');
    expect(passwordStrength('abcd1234').label).toBe('Fair');
    expect(passwordStrength('Abcd1234').label).toBe('Good');
    expect(passwordStrength('Abcd1234!').label).toBe('Strong');
    expect(passwordStrength('correct horse battery 9').score).toBe(3);
  });

  it('matches the API password policy', () => {
    const check = (value: string) => passwordRules(new FormControl(value));
    expect(check('')).toBeNull();
    expect(check('a1')).toEqual({ passwordLength: true });
    expect(check('onlyletters')).toEqual({ passwordMix: true });
    expect(check('12345678')).toEqual({ passwordMix: true });
    expect(check('letters123')).toBeNull();
  });

  it('flags a confirmation that does not match', () => {
    const form = new FormGroup(
      { password: new FormControl('secret123'), confirm: new FormControl('secret12') },
      { validators: matchFields('password', 'confirm') },
    );
    expect(form.controls.confirm.hasError('mismatch')).toBe(true);
    expect(form.valid).toBe(false);

    form.controls.confirm.setValue('secret123');
    expect(form.controls.confirm.errors).toBeNull();
    expect(form.valid).toBe(true);
  });
});
