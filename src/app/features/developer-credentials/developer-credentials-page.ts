import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { DeveloperCredentialApiService } from '../../core/api/developer-credential-api.service';

export interface DeveloperCredentialMetadata {
  readonly publicId: string;
  readonly displayName: string;
  readonly scope: 'form-intelligence:read';
  readonly environment: 'development';
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly lastUsedAt: string | null;
}

interface IssuedDeveloperCredential extends DeveloperCredentialMetadata {
  readonly credential: string;
}

@Component({
  selector: 'app-developer-credentials-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './developer-credentials-page.html',
})
export class DeveloperCredentialsPage implements OnInit, OnDestroy {
  readonly form = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    expiresInDays: new FormControl(7, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(30)],
    }),
    currentPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(16_384)],
    }),
  });
  readonly credentials = signal<readonly DeveloperCredentialMetadata[]>([]);
  readonly loading = signal(true);
  readonly available = signal(true);
  readonly submitting = signal(false);
  readonly message = signal<string | undefined>(undefined);
  readonly oneTimeCredential = signal<string | undefined>(undefined);
  readonly copied = signal(false);
  readonly pendingRevocation = signal<string | undefined>(undefined);
  private readonly statusMessage = viewChild<ElementRef<HTMLElement>>('statusMessage');
  private readonly oneTimeSecret = viewChild<ElementRef<HTMLElement>>('oneTimeSecret');

  constructor(private readonly api: DeveloperCredentialApiService) {}

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    this.oneTimeCredential.set(undefined);
    this.form.controls.currentPassword.reset('');
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.message.set(undefined);
    try {
      const response = parseCredentialList(await firstValueFrom(this.api.list()));
      this.available.set(true);
      this.credentials.set(response);
    } catch {
      this.available.set(false);
      this.message.set(
        'Developer credentials could not be loaded. This feature is local-development only.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async issue(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.message.set(undefined);
    this.oneTimeCredential.set(undefined);
    this.copied.set(false);
    try {
      const issued = parseIssuedCredential(
        await firstValueFrom(
          this.api.issue(
            this.form.controls.displayName.value,
            this.form.controls.expiresInDays.value,
            this.form.controls.currentPassword.value,
          ),
        ),
      );
      const { credential, ...metadata } = issued;
      this.oneTimeCredential.set(credential);
      this.credentials.update((current) => [metadata, ...current]);
      this.form.reset({ displayName: '', expiresInDays: 7, currentPassword: '' });
      setTimeout(() => this.oneTimeSecret()?.nativeElement.focus());
    } catch (error) {
      this.form.controls.currentPassword.reset('');
      this.message.set(
        error instanceof HttpErrorResponse && error.status === 401
          ? 'The current password is incorrect.'
          : 'The developer credential could not be created.',
      );
      setTimeout(() => this.statusMessage()?.nativeElement.focus());
    } finally {
      this.submitting.set(false);
    }
  }

  async copyCredential(): Promise<void> {
    const credential = this.oneTimeCredential();
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(credential);
      this.copied.set(true);
    } catch {
      this.message.set('Copy failed. Select and copy the credential manually.');
    }
  }

  hideCredential(): void {
    this.oneTimeCredential.set(undefined);
    this.copied.set(false);
  }

  async revoke(credential: DeveloperCredentialMetadata): Promise<void> {
    if (credential.revokedAt) return;
    this.message.set(undefined);
    try {
      await firstValueFrom(this.api.revoke(credential.publicId));
      const revokedAt = new Date().toISOString();
      this.credentials.update((current) =>
        current.map((item) =>
          item.publicId === credential.publicId ? { ...item, revokedAt } : item,
        ),
      );
      this.pendingRevocation.set(undefined);
    } catch {
      this.message.set('The developer credential could not be revoked.');
      setTimeout(() => this.statusMessage()?.nativeElement.focus());
    }
  }

  requestRevocation(publicId: string): void {
    this.pendingRevocation.set(publicId);
  }

  cancelRevocation(): void {
    this.pendingRevocation.set(undefined);
  }
}

export function parseCredentialList(value: unknown): readonly DeveloperCredentialMetadata[] {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Array.isArray(value['credentials'])) {
    throw new Error('Invalid credential list response.');
  }
  return value['credentials'].map(parseMetadata);
}

export function parseIssuedCredential(value: unknown): IssuedDeveloperCredential {
  if (!isRecord(value) || typeof value['credential'] !== 'string') {
    throw new Error('Invalid issued credential response.');
  }
  const metadata = parseMetadata(value);
  if (!new RegExp(`^ffmcp_v1\\.${UUID_V4_SOURCE}\\.[A-Za-z0-9_-]{43}$`).test(value['credential'])) {
    throw new Error('Invalid issued credential response.');
  }
  return { ...metadata, credential: value['credential'] };
}

function parseMetadata(value: unknown): DeveloperCredentialMetadata {
  if (!isRecord(value)) throw new Error('Invalid credential metadata.');
  const expected = [
    'publicId',
    'displayName',
    'scope',
    'environment',
    'createdAt',
    'expiresAt',
    'revokedAt',
    'lastUsedAt',
  ];
  const keys = Object.keys(value).filter((key) => key !== 'credential');
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new Error('Invalid credential metadata.');
  }
  if (
    typeof value['publicId'] !== 'string' ||
    !new RegExp(`^${UUID_V4_SOURCE}$`).test(value['publicId']) ||
    typeof value['displayName'] !== 'string' ||
    value['displayName'].length < 1 ||
    value['displayName'].length > 80 ||
    value['displayName'] !== value['displayName'].trim() ||
    value['scope'] !== 'form-intelligence:read' ||
    value['environment'] !== 'development' ||
    !isTimestamp(value['createdAt']) ||
    !isTimestamp(value['expiresAt']) ||
    !isOptionalTimestamp(value['revokedAt']) ||
    !isOptionalTimestamp(value['lastUsedAt'])
  ) {
    throw new Error('Invalid credential metadata.');
  }
  return value as unknown as DeveloperCredentialMetadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

const UUID_V4_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

function isOptionalTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}
