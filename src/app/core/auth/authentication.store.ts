import { HttpErrorResponse } from '@angular/common/http';
import { computed, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthenticationApiService } from '../api/authentication-api.service';

export type AuthenticationStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';

@Injectable({ providedIn: 'root' })
export class AuthenticationStore {
  private readonly statusState = signal<AuthenticationStatus>('loading');
  private bootstrapPromise: Promise<AuthenticationStatus> | undefined;

  readonly status = this.statusState.asReadonly();
  readonly authenticated = computed(() => this.statusState() === 'authenticated');

  constructor(private readonly api: AuthenticationApiService) {}

  bootstrap(): Promise<AuthenticationStatus> {
    this.bootstrapPromise ??= this.loadSession();
    return this.bootstrapPromise;
  }

  async login(email: string, password: string): Promise<'authenticated' | 'invalid' | 'error'> {
    try {
      await firstValueFrom(this.api.bootstrapXsrf());
      const response = await firstValueFrom(this.api.login(email, password));
      if (!isExactBooleanResponse(response, 'authenticated')) throw new InvalidAuthResponseError();
      this.statusState.set('authenticated');
      this.bootstrapPromise = Promise.resolve('authenticated');
      return 'authenticated';
    } catch (error) {
      this.statusState.set('anonymous');
      return error instanceof HttpErrorResponse && error.status === 401 ? 'invalid' : 'error';
    }
  }

  async register(email: string, password: string): Promise<'accepted' | 'invalid' | 'error'> {
    try {
      await firstValueFrom(this.api.bootstrapXsrf());
      const response = await firstValueFrom(this.api.register(email, password));
      if (!isExactBooleanResponse(response, 'accepted')) throw new InvalidAuthResponseError();
      return 'accepted';
    } catch (error) {
      return error instanceof HttpErrorResponse && error.status === 400 ? 'invalid' : 'error';
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.logout());
    } catch {
      // Local state still fails closed; the next bootstrap rechecks the server.
    } finally {
      this.statusState.set('anonymous');
      this.bootstrapPromise = Promise.resolve('anonymous');
    }
  }

  private async loadSession(): Promise<AuthenticationStatus> {
    this.statusState.set('loading');
    try {
      const response = await firstValueFrom(this.api.session());
      if (!isExactBooleanResponse(response, 'authenticated')) throw new InvalidAuthResponseError();
      this.statusState.set('authenticated');
    } catch (error) {
      this.statusState.set(
        error instanceof HttpErrorResponse && error.status === 401 ? 'anonymous' : 'error',
      );
    }
    return this.statusState();
  }
}

class InvalidAuthResponseError extends Error {}

function isExactBooleanResponse(value: unknown, key: 'accepted' | 'authenticated'): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === 1 &&
    key in value &&
    (value as Record<string, unknown>)[key] === true
  );
}
