import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FORM_IDENTIFIER_PATTERN } from '@form-farm/form-domain';
import { take } from 'rxjs';
import { FormManagementApiService } from '../../core/api/form-management-api.service';

export interface ManagedFormSummary {
  readonly id: string;
  readonly title: string;
  readonly status: 'draft' | 'published' | 'archived';
  readonly latestVersion: number;
  readonly currentPublishedVersion: number | null;
  readonly draftRevision: number | null;
  readonly updatedAt: string;
}

@Injectable()
export class FormManagementStore {
  private readonly api = inject(FormManagementApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formsState = signal<readonly ManagedFormSummary[]>([]);
  private readonly statusState = signal<'loading' | 'loaded' | 'error'>('loading');
  private readonly cursorState = signal<string | null>(null);
  readonly forms = this.formsState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly nextCursor = this.cursorState.asReadonly();

  load(cursor?: string): void {
    this.statusState.set('loading');
    this.api
      .listForms(cursor)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          const parsed = parseResponse(value);
          if (!parsed) return this.statusState.set('error');
          this.formsState.set(parsed.forms);
          this.cursorState.set(parsed.nextCursor);
          this.statusState.set('loaded');
        },
        error: () => this.statusState.set('error'),
      });
  }
}

const identifier = new RegExp(FORM_IDENTIFIER_PATTERN);
function parseResponse(
  value: unknown,
): { forms: readonly ManagedFormSummary[]; nextCursor: string | null } | undefined {
  if (
    !exact(value, ['forms', 'nextCursor']) ||
    !Array.isArray(value['forms']) ||
    !(value['nextCursor'] === null || typeof value['nextCursor'] === 'string')
  )
    return undefined;
  const forms: ManagedFormSummary[] = [];
  for (const item of value['forms']) {
    if (
      !exact(item, [
        'id',
        'title',
        'status',
        'latestVersion',
        'currentPublishedVersion',
        'draftRevision',
        'updatedAt',
      ])
    )
      return undefined;
    if (
      typeof item['id'] !== 'string' ||
      !identifier.test(item['id']) ||
      typeof item['title'] !== 'string' ||
      !item['title'] ||
      !['draft', 'published', 'archived'].includes(String(item['status'])) ||
      !safe(item['latestVersion'], 0) ||
      !(item['currentPublishedVersion'] === null || safe(item['currentPublishedVersion'], 1)) ||
      !(item['draftRevision'] === null || safe(item['draftRevision'], 1)) ||
      typeof item['updatedAt'] !== 'string' ||
      !timestamp(item['updatedAt'])
    )
      return undefined;
    forms.push(item as unknown as ManagedFormSummary);
  }
  return { forms, nextCursor: value['nextCursor'] as string | null };
}
function safe(value: unknown, minimum: number): boolean {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}
function timestamp(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  );
}
