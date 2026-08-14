import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FORM_IDENTIFIER_PATTERN,
  validateFormDefinition,
  type FormDefinition,
} from '@form-farm/form-domain';
import { take } from 'rxjs';
import { FormManagementApiService } from '../../core/api/form-management-api.service';

@Component({
  selector: 'app-form-editor-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: ` <main class="container py-5" id="main-content">
    <a routerLink="/manage/forms">&larr; Manage forms</a>
    <h1 class="mt-3">{{ formId ? 'Edit form' : 'Create form' }}</h1>
    @if (status() === 'loading') {
      <p role="status">Loading draft&hellip;</p>
    } @else {
      <form class="card card-body mt-4" [formGroup]="form" (ngSubmit)="save()">
        @if (!formId) {
          <label class="form-label" for="form-id">Stable form ID</label
          ><input id="form-id" class="form-control mb-3" formControlName="id" />
        }
        <label class="form-label" for="form-title">Title</label
        ><input id="form-title" class="form-control mb-3" formControlName="title" />
        <label class="form-label" for="form-description">Description</label
        ><textarea
          id="form-description"
          class="form-control mb-3"
          formControlName="description"
        ></textarea>
        <p class="text-body-secondary">
          This first builder edits presentation details while preserving the complete validated
          field structure.
        </p>
        <div class="d-flex gap-2">
          <button
            class="btn btn-primary"
            type="submit"
            [disabled]="form.invalid || status() === 'saving'"
          >
            {{ formId ? 'Save draft' : 'Create draft' }}
          </button>
          @if (formId) {
            <button
              class="btn btn-success"
              type="button"
              [disabled]="status() === 'saving'"
              (click)="publish()"
            >
              Publish
            </button>
          }
        </div>
      </form>
    }
    @if (message()) {
      <p
        class="alert mt-3"
        [class.alert-success]="status() === 'saved'"
        [class.alert-warning]="status() === 'error'"
        role="status"
      >
        {{ message() }}
      </p>
    }
  </main>`,
})
export class FormEditorPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly formId = this.route.snapshot.paramMap.get('formId');
  readonly status = signal<'loading' | 'ready' | 'saving' | 'saved' | 'error'>(
    this.formId ? 'loading' : 'ready',
  );
  readonly message = signal('');
  private definition?: FormDefinition;
  private etag?: string;
  readonly form = new FormGroup({
    id: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(FORM_IDENTIFIER_PATTERN)],
    }),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
  });
  constructor(
    private readonly router: Router,
    private readonly api: FormManagementApiService,
  ) {}
  ngOnInit(): void {
    if (this.formId)
      this.api
        .loadDraft(this.formId)
        .pipe(take(1))
        .subscribe({
          next: (response) => this.acceptDraft(response.body, response.headers.get('etag')),
          error: () => this.fail('We could not load this draft.'),
        });
  }
  save(): void {
    if (this.form.invalid) return;
    if (!this.formId) return this.create();
    if (!this.definition || !this.etag) return this.fail('Reload the draft before saving.');
    const candidate = {
      ...this.definition,
      title: this.form.controls.title.value,
    };
    if (this.form.controls.description.value)
      candidate.description = this.form.controls.description.value;
    else delete candidate.description;
    this.status.set('saving');
    this.api
      .save(this.formId, candidate, this.etag)
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          this.acceptDraft(response.body, response.headers.get('etag'));
          this.status.set('saved');
          this.message.set('Draft saved.');
        },
        error: () =>
          this.fail('The draft could not be saved. Reload if another editor changed it.'),
      });
  }
  publish(): void {
    if (!this.formId || !this.etag) return;
    this.status.set('saving');
    this.api
      .publish(this.formId, this.etag)
      .pipe(take(1))
      .subscribe({
        next: (value) => {
          if (!validPublication(value, this.formId!))
            return this.fail('The server returned an invalid publication response.');
          this.status.set('saved');
          this.message.set('Form published.');
        },
        error: () => this.fail('The form could not be published.'),
      });
  }
  private create(): void {
    const value = this.form.getRawValue();
    const definition: FormDefinition = {
      schemaVersion: 1,
      id: value.id,
      formVersion: 1,
      title: value.title,
      ...(value.description ? { description: value.description } : {}),
      sections: [
        {
          id: 'main',
          title: 'Main',
          fields: [{ id: 'response', type: 'text', label: 'Response' }],
        },
      ],
      submission: { submitLabel: 'Submit', successMessage: 'Thank you.' },
    };
    this.status.set('saving');
    this.api
      .create(definition)
      .pipe(take(1))
      .subscribe({
        next: (value) => {
          if (!validCreatedDraft(value, definition))
            return this.fail('The server returned an invalid draft.');
          void this.router.navigate(['/manage/forms', definition.id, 'edit']);
        },
        error: () => this.fail('The draft could not be created. Check that the ID is available.'),
      });
  }
  private acceptDraft(value: unknown, etag: string | null): void {
    if (
      !exact(value, [
        'formId',
        'status',
        'draftRevision',
        'definition',
        'createdAt',
        'updatedAt',
      ]) &&
      !exact(value, [
        'formId',
        'status',
        'draftRevision',
        'definition',
        'createdAt',
        'updatedAt',
        'created',
      ])
    )
      return this.fail('The server returned an invalid draft.');
    if (
      !etag ||
      !/^"draft-[1-9][0-9]*"$/.test(etag) ||
      value['formId'] !== this.formId ||
      value['status'] !== 'draft' ||
      !Number.isSafeInteger(value['draftRevision']) ||
      etag !== `"draft-${value['draftRevision']}"` ||
      !canonicalTimestamp(value['createdAt']) ||
      !canonicalTimestamp(value['updatedAt']) ||
      ('created' in value && typeof value['created'] !== 'boolean')
    )
      return this.fail('The server returned an invalid draft.');
    const result = validateFormDefinition(value['definition']);
    if (!result.success || result.value.id !== this.formId)
      return this.fail('The server returned an invalid draft.');
    this.definition = result.value;
    this.etag = etag;
    this.form.patchValue({
      id: result.value.id,
      title: result.value.title,
      description: result.value.description ?? '',
    });
    this.status.set('ready');
    this.message.set('');
  }
  private fail(message: string): void {
    this.status.set('error');
    this.message.set(message);
  }
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
function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}
function validCreatedDraft(value: unknown, definition: FormDefinition): boolean {
  if (
    !exact(value, ['formId', 'status', 'draftRevision', 'definition', 'createdAt']) ||
    value['formId'] !== definition.id ||
    value['status'] !== 'draft' ||
    value['draftRevision'] !== 1 ||
    !canonicalTimestamp(value['createdAt'])
  )
    return false;
  const parsed = validateFormDefinition(value['definition']);
  return parsed.success && parsed.value.id === definition.id && parsed.value.formVersion === 1;
}
function validPublication(value: unknown, formId: string): boolean {
  return (
    exact(value, ['formId', 'status', 'formVersion', 'publishedAt']) &&
    value['formId'] === formId &&
    value['status'] === 'published' &&
    Number.isSafeInteger(value['formVersion']) &&
    (value['formVersion'] as number) > 0 &&
    canonicalTimestamp(value['publishedAt'])
  );
}
