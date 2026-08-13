import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const accountEmailValidator: ValidatorFn = (
  control: AbstractControl<string>,
): ValidationErrors | null => {
  const normalized = control.value.trim().normalize('NFC');
  return Array.from(normalized).length >= 3 &&
    Array.from(normalized).length <= 254 &&
    !/\s/.test(normalized) &&
    /^[^@]+@[^@]+$/.test(normalized)
    ? null
    : { accountEmail: true };
};

export function passwordCodePointLength(minimum: number): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const length = Array.from(control.value).length;
    return length >= minimum && length <= 1_024 ? null : { passwordLength: true };
  };
}
