import type { FormDefinition } from '../form-definition.models.js';

export const USER_REGISTRATION_FORM: FormDefinition = {
  schemaVersion: 1,
  id: 'user-registration',
  formVersion: 1,
  title: 'Create your account',
  description: 'Enter your details to register.',
  sections: [
    {
      id: 'profile',
      title: 'Your details',
      fields: [
        {
          id: 'fullName',
          type: 'text',
          label: 'Full name',
          autocomplete: 'name',
          validation: [{ type: 'required' }, { type: 'maxLength', value: 100 }],
        },
        {
          id: 'email',
          type: 'email',
          label: 'Email address',
          autocomplete: 'email',
          validation: [{ type: 'required' }],
        },
        {
          id: 'phone',
          type: 'tel',
          label: 'Phone number',
          autocomplete: 'tel',
        },
      ],
    },
    {
      id: 'account',
      title: 'Account details',
      fields: [
        {
          id: 'password',
          type: 'password',
          label: 'Password',
          autocomplete: 'new-password',
          helpText: 'Use at least 12 characters.',
          validation: [
            { type: 'required' },
            { type: 'minLength', value: 12 },
            { type: 'maxLength', value: 128 },
          ],
        },
        {
          id: 'preferredContact',
          type: 'radio',
          label: 'Preferred contact method',
          options: [
            { label: 'Email', value: 'email' },
            { label: 'Phone', value: 'phone' },
          ],
          validation: [{ type: 'required' }],
        },
        {
          id: 'acceptTerms',
          type: 'checkbox',
          label: 'I accept the terms and conditions',
          validation: [{ type: 'accepted' }],
        },
      ],
    },
  ],
  submission: {
    submitLabel: 'Create account',
    successMessage: 'Your account has been created.',
  },
};
