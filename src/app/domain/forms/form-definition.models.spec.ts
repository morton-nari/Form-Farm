import { USER_REGISTRATION_FORM } from './examples/user-registration.form';
import { FormField } from './form-definition.models';

describe('provider-neutral form definition', () => {
  it('represents a complete form without feature or provider metadata', () => {
    expect(USER_REGISTRATION_FORM).toMatchObject({
      schemaVersion: 1,
      id: 'user-registration',
      formVersion: 1,
      title: 'Create your account',
    });
    expect(USER_REGISTRATION_FORM.sections.map((section) => section.id)).toEqual([
      'profile',
      'account',
    ]);
    expect(
      USER_REGISTRATION_FORM.sections.flatMap((section) => section.fields.map((field) => field.id)),
    ).toEqual(['fullName', 'email', 'phone', 'password', 'preferredContact', 'acceptTerms']);
  });

  it('keeps option labels separate from submitted values', () => {
    const preferredContact = USER_REGISTRATION_FORM.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === 'preferredContact');

    expect(preferredContact?.type).toBe('radio');
    if (preferredContact?.type !== 'radio') {
      throw new Error('Expected preferredContact to be a radio field.');
    }

    expect(preferredContact.options).toEqual([
      { label: 'Email', value: 'email' },
      { label: 'Phone', value: 'phone' },
    ]);
  });

  it('supports exhaustive field-type handling', () => {
    const fieldTypes: readonly FormField['type'][] = [
      'text',
      'email',
      'password',
      'tel',
      'url',
      'textarea',
      'number',
      'date',
      'datetime',
      'time',
      'select',
      'radio',
      'multi-select',
      'checkbox',
      'checkbox-group',
    ];

    expect(fieldTypes).toHaveLength(15);
  });
});
