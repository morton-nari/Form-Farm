import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, take } from 'rxjs';

import { FormDefinitionApiService } from '../../../core/api/form-definition-api.service';
import { FormSubmissionApiService } from '../../../core/api/form-submission-api.service';
import {
  FormAnswers,
  FormDefinition,
  validateFormDefinition,
} from '@form-farm/form-domain';

export type FormLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
export type FormSubmissionStatus = 'idle' | 'submitting' | 'success' | 'error';

@Injectable({ providedIn: 'root' })
export class FormViewerStore {
  private readonly api = inject(FormDefinitionApiService);
  private readonly submissionApi = inject(FormSubmissionApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly definitionState = signal<FormDefinition | null>(null);
  private readonly loadStatusState = signal<FormLoadStatus>('idle');
  private readonly errorMessageState = signal<string | null>(null);
  private readonly submissionStatusState = signal<FormSubmissionStatus>('idle');
  private readonly submissionErrorMessageState = signal<string | null>(null);
  private loadSubscription?: Subscription;
  private submissionSubscription?: Subscription;
  private submissionAttempt?: { readonly identity: string; readonly idempotencyKey: string };

  readonly definition = this.definitionState.asReadonly();
  readonly loadStatus = this.loadStatusState.asReadonly();
  readonly errorMessage = this.errorMessageState.asReadonly();
  readonly submissionStatus = this.submissionStatusState.asReadonly();
  readonly submissionErrorMessage = this.submissionErrorMessageState.asReadonly();

  load(formId: string): void {
    this.loadSubscription?.unsubscribe();
    this.definitionState.set(null);
    this.loadStatusState.set('loading');
    this.errorMessageState.set(null);
    this.resetSubmission(true);

    this.loadSubscription = this.api
      .getFormDefinition(formId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (candidate) => {
          const result = validateFormDefinition(candidate);
          if (!result.success) {
            this.setLoadError();
            return;
          }

          this.definitionState.set(result.value);
          this.loadStatusState.set('loaded');
        },
        error: () => this.setLoadError(),
      });
  }

  submit(definition: FormDefinition, answers: FormAnswers): void {
    if (this.submissionStatusState() === 'submitting') return;

    const identity = JSON.stringify({
      formId: definition.id,
      formVersion: definition.formVersion,
      answers,
    });
    if (this.submissionAttempt?.identity !== identity) {
      this.submissionAttempt = { identity, idempotencyKey: crypto.randomUUID() };
    }

    this.submissionStatusState.set('submitting');
    this.submissionErrorMessageState.set(null);
    this.submissionSubscription?.unsubscribe();
    this.submissionSubscription = this.submissionApi
      .submit(
        definition.id,
        definition.formVersion,
        answers,
        this.submissionAttempt.idempotencyKey,
      )
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (candidate) => {
          if (!isSubmissionResponse(candidate)) {
            this.setSubmissionError();
            return;
          }
          this.submissionStatusState.set('success');
        },
        error: () => this.setSubmissionError(),
      });
  }

  resetSubmissionView(): void {
    this.resetSubmission(false);
  }

  private setLoadError(): void {
    this.definitionState.set(null);
    this.loadStatusState.set('error');
    this.errorMessageState.set('We could not load this form. Please try again.');
  }

  private setSubmissionError(): void {
    this.submissionStatusState.set('error');
    this.submissionErrorMessageState.set('We could not submit your answers. Please try again.');
  }

  private resetSubmission(clearAttempt: boolean): void {
    this.submissionSubscription?.unsubscribe();
    this.submissionStatusState.set('idle');
    this.submissionErrorMessageState.set(null);
    if (clearAttempt) this.submissionAttempt = undefined;
  }
}

function isSubmissionResponse(value: unknown): value is {
  readonly submissionId: string;
  readonly replayed: boolean;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).length === 2 &&
    typeof candidate['submissionId'] === 'string' &&
    candidate['submissionId'].length > 0 &&
    typeof candidate['replayed'] === 'boolean'
  );
}
