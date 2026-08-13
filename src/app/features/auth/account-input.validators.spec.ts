import { FormControl } from '@angular/forms';

import { accountEmailValidator, passwordCodePointLength } from './account-input.validators';

describe('account input validators', () => {
  it('matches the account-identifier syntax boundary without claiming deliverability', () => {
    expect(
      accountEmailValidator(new FormControl(' Person@Example.COM ', { nonNullable: true })),
    ).toBeNull();
    expect(
      accountEmailValidator(new FormControl('invalid address', { nonNullable: true })),
    ).toEqual({
      accountEmail: true,
    });
  });

  it('counts password Unicode code points rather than UTF-16 code units', () => {
    const validator = passwordCodePointLength(15);
    expect(validator(new FormControl('😀'.repeat(14), { nonNullable: true }))).toEqual({
      passwordLength: true,
    });
    expect(validator(new FormControl('😀'.repeat(15), { nonNullable: true }))).toBeNull();
  });
});
