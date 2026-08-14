import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FORM_IDENTIFIER_PATTERN } from '@form-farm/form-domain';
import { take } from 'rxjs';

import { FormsDashboardApiService } from '../../core/api/forms-dashboard-api.service';

export interface FormDashboardSummary {
  readonly id: string;
  readonly title: string;
  readonly formVersion: number;
  readonly updatedAt: string;
}

export type FormsDashboardStatus = 'loading' | 'loaded' | 'error';

@Injectable()
export class FormsDashboardStore {
  private readonly api = inject(FormsDashboardApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formsState = signal<readonly FormDashboardSummary[]>([]);
  private readonly statusState = signal<FormsDashboardStatus>('loading');

  readonly forms = this.formsState.asReadonly();
  readonly status = this.statusState.asReadonly();

  load(): void {
    this.statusState.set('loading');
    this.api
      .listForms()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (candidate) => {
          const forms = parseDashboardResponse(candidate);
          if (!forms) return this.statusState.set('error');
          this.formsState.set(forms);
          this.statusState.set('loaded');
        },
        error: () => this.statusState.set('error'),
      });
  }
}

const identifier = new RegExp(FORM_IDENTIFIER_PATTERN);

function parseDashboardResponse(value: unknown): readonly FormDashboardSummary[] | undefined {
  if (!isExactObject(value, ['forms']) || !Array.isArray(value['forms'])) return undefined;
  const forms: FormDashboardSummary[] = [];
  for (const candidate of value['forms']) {
    if (!isExactObject(candidate, ['id', 'title', 'formVersion', 'updatedAt'])) return undefined;
    if (
      typeof candidate['id'] !== 'string' ||
      !identifier.test(candidate['id']) ||
      typeof candidate['title'] !== 'string' ||
      candidate['title'].length === 0 ||
      !Number.isSafeInteger(candidate['formVersion']) ||
      (candidate['formVersion'] as number) < 1 ||
      typeof candidate['updatedAt'] !== 'string' ||
      !isCanonicalTimestamp(candidate['updatedAt'])
    ) {
      return undefined;
    }
    forms.push(candidate as unknown as FormDashboardSummary);
  }
  return forms;
}

function isCanonicalTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function isExactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  );
}
