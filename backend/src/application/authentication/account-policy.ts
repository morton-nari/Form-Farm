import { ApplicationError } from '../errors/application-error.js';

export function normalizeAccountEmail(email: string): string {
  const normalized = email.trim().normalize('NFC').toLowerCase();
  if (
    codePointLength(normalized) < 3 ||
    codePointLength(normalized) > 254 ||
    /\s/.test(normalized) ||
    !/^[^@]+@[^@]+$/.test(normalized)
  ) {
    throw new ApplicationError('invalid_input', 'The account details are invalid.');
  }
  return normalized;
}

export function assertRegistrationPassword(password: string): void {
  const length = codePointLength(password);
  if (length < 15 || length > 1_024) {
    throw new ApplicationError('invalid_input', 'The account details are invalid.');
  }
}

export function assertLoginPassword(password: string): void {
  const length = codePointLength(password);
  if (length < 1 || length > 1_024) {
    throw new ApplicationError('invalid_input', 'The account details are invalid.');
  }
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}
