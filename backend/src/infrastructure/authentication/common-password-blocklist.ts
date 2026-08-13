import type { PasswordBlocklist } from '../../application/ports/authentication.js';

const COMMON_PASSWORDS = new Set([
  '123456789012345',
  'correcthorsebatterystaple',
  'formfarmaipassword',
  'passwordpassword',
  'qwertyuiopasdfgh',
]);

export class CommonPasswordBlocklist implements PasswordBlocklist {
  contains(password: string): boolean {
    return COMMON_PASSWORDS.has(password.toLowerCase());
  }
}
