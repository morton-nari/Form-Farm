import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, take } from 'rxjs';

import { FormDefinitionApiService } from '../../../core/api/form-definition-api.service';
import { FormDefinition } from '../../../domain/forms/form-definition.models';
import { validateFormDefinition } from '../../../domain/forms/form-definition.validator';

export type FormLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

@Injectable({ providedIn: 'root' })
export class FormViewerStore {
  private readonly api = inject(FormDefinitionApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly definitionState = signal<FormDefinition | null>(null);
  private readonly loadStatusState = signal<FormLoadStatus>('idle');
  private readonly errorMessageState = signal<string | null>(null);
  private loadSubscription?: Subscription;

  readonly definition = this.definitionState.asReadonly();
  readonly loadStatus = this.loadStatusState.asReadonly();
  readonly errorMessage = this.errorMessageState.asReadonly();

  load(formId: string): void {
    this.loadSubscription?.unsubscribe();
    this.definitionState.set(null);
    this.loadStatusState.set('loading');
    this.errorMessageState.set(null);

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

  private setLoadError(): void {
    this.definitionState.set(null);
    this.loadStatusState.set('error');
    this.errorMessageState.set('We could not load this form. Please try again.');
  }
}
