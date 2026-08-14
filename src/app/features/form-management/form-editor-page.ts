import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnInit,
  QueryList,
  signal,
  ViewChildren,
} from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FORM_IDENTIFIER_PATTERN,
  validateFormDefinition,
  type FormDefinition,
  type FormField,
} from '@form-farm/form-domain';
import { take } from 'rxjs';
import { FormManagementApiService } from '../../core/api/form-management-api.service';
import { HttpErrorResponse } from '@angular/common/http';

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
        <fieldset class="border rounded p-3 mb-3" formArrayName="sections">
          <legend class="float-none w-auto px-2 fs-5">Sections</legend>
          @for (section of sections.controls; track section.controls.id.value; let index = $index) {
            <div class="border rounded p-3 mb-3" [formGroupName]="index">
              <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
                <h2 class="h6 mb-0">Section {{ index + 1 }}</h2>
                <div class="btn-group" aria-label="Section order and removal">
                  <button
                    class="btn btn-sm btn-outline-secondary"
                    type="button"
                    [disabled]="index === 0"
                    (click)="moveSection(index, -1)"
                    [attr.aria-label]="'Move section ' + (index + 1) + ' up'"
                  >
                    Move up
                  </button>
                  <button
                    class="btn btn-sm btn-outline-secondary"
                    type="button"
                    [disabled]="index === sections.length - 1"
                    (click)="moveSection(index, 1)"
                    [attr.aria-label]="'Move section ' + (index + 1) + ' down'"
                  >
                    Move down
                  </button>
                  <button
                    class="btn btn-sm btn-outline-danger"
                    type="button"
                    [disabled]="sections.length === 1"
                    (click)="removeSection(index)"
                    [attr.aria-label]="'Remove section ' + (index + 1)"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <label class="form-label" [for]="'section-title-' + index">Section title</label>
              <input
                #sectionTitle
                class="form-control mb-3"
                [id]="'section-title-' + index"
                formControlName="title"
              />
              <label class="form-label" [for]="'section-description-' + index"
                >Section description</label
              >
              <textarea
                class="form-control"
                [id]="'section-description-' + index"
                formControlName="description"
              ></textarea>
              <p class="form-text mb-0">
                {{ sectionFieldCount(section.controls.id.value) }} existing field(s) are preserved.
              </p>
            </div>
          }
          <button class="btn btn-outline-primary" type="button" (click)="addSection()">
            Add section
          </button>
        </fieldset>
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
              [disabled]="status() === 'saving' || form.dirty"
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
  @ViewChildren('sectionTitle') private readonly sectionTitles!: QueryList<
    ElementRef<HTMLInputElement>
  >;
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
    sections: new FormArray<SectionFormGroup>([]),
  });
  private readonly fieldsBySectionId = new Map<string, readonly FormField[]>();

  get sections(): FormArray<SectionFormGroup> {
    return this.form.controls.sections;
  }
  constructor(
    private readonly router: Router,
    private readonly api: FormManagementApiService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    if (!this.formId) {
      this.fieldsBySectionId.set('main', [{ id: 'response', type: 'text', label: 'Response' }]);
      this.sections.push(sectionGroup('main', 'Main', ''), { emitEvent: false });
    }
  }
  ngOnInit(): void {
    if (this.formId) this.loadDraft();
  }
  save(): void {
    if (this.form.invalid) return;
    if (!this.formId) return this.create();
    if (!this.definition || !this.etag) return this.fail('Reload the draft before saving.');
    const candidate = {
      ...this.definition,
      title: this.form.controls.title.value,
      sections: this.sections.controls.map((section) => {
        const value = section.getRawValue();
        return {
          id: value.id,
          title: value.title,
          ...(value.description ? { description: value.description } : {}),
          fields: this.fieldsBySectionId.get(value.id) ?? [],
        };
      }),
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
          if (!this.acceptDraft(response.body, response.headers.get('etag'))) return;
          this.status.set('saved');
          this.message.set('Draft saved.');
        },
        error: () =>
          this.fail('The draft could not be saved. Reload if another editor changed it.'),
      });
  }
  addSection(): void {
    const sectionId = nextIdentifier(
      'section',
      new Set(this.sections.controls.map((item) => item.controls.id.value)),
    );
    const existingFieldIds = new Set(
      [...this.fieldsBySectionId.values()].flatMap((fields) => fields.map((field) => field.id)),
    );
    const fieldId = nextIdentifier('response', existingFieldIds);
    this.fieldsBySectionId.set(sectionId, [{ id: fieldId, type: 'text', label: 'Response' }]);
    this.sections.push(sectionGroup(sectionId, `Section ${this.sections.length + 1}`, ''));
    this.form.markAsDirty();
    this.focusSection(this.sections.length - 1);
  }
  moveSection(index: number, offset: -1 | 1): void {
    const target = index + offset;
    if (index < 0 || index >= this.sections.length || target < 0 || target >= this.sections.length)
      return;
    const section = this.sections.at(index);
    this.sections.removeAt(index, { emitEvent: false });
    this.sections.insert(target, section, { emitEvent: false });
    this.form.markAsDirty();
    this.focusSection(target);
  }
  removeSection(index: number): void {
    if (this.sections.length <= 1 || index < 0 || index >= this.sections.length) return;
    const removed = this.sections.at(index);
    this.sections.removeAt(index);
    this.fieldsBySectionId.delete(removed.controls.id.value);
    this.form.markAsDirty();
    this.focusSection(Math.min(index, this.sections.length - 1));
  }
  sectionFieldCount(sectionId: string): number {
    return this.fieldsBySectionId.get(sectionId)?.length ?? 0;
  }
  private focusSection(index: number): void {
    this.changeDetector.detectChanges();
    this.sectionTitles.get(index)?.nativeElement.focus();
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
          this.definition = undefined;
          this.etag = undefined;
          void this.router.navigate(['/manage/forms']);
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
      sections: this.sections.controls.map((section) => {
        const sectionValue = section.getRawValue();
        return {
          id: sectionValue.id,
          title: sectionValue.title,
          ...(sectionValue.description ? { description: sectionValue.description } : {}),
          fields: this.fieldsBySectionId.get(sectionValue.id) ?? [],
        };
      }),
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
  private loadDraft(): void {
    this.api
      .loadDraft(this.formId!)
      .pipe(take(1))
      .subscribe({
        next: (response) => this.acceptDraft(response.body, response.headers.get('etag')),
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.api
              .bootstrap(this.formId!)
              .pipe(take(1))
              .subscribe({
                next: (response) => this.acceptDraft(response.body, response.headers.get('etag')),
                error: () => this.fail('We could not start editing this form.'),
              });
          } else this.fail('We could not load this draft.');
        },
      });
  }

  private acceptDraft(value: unknown, etag: string | null): boolean {
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
      return this.rejectDraft();
    if (!etag) return this.rejectDraft();
    const match = /^"draft-([1-9][0-9]*)"$/.exec(etag);
    const etagRevision = match ? Number(match[1]) : Number.NaN;
    if (
      !Number.isSafeInteger(etagRevision) ||
      etagRevision < 1 ||
      value['formId'] !== this.formId ||
      value['status'] !== 'draft' ||
      !Number.isSafeInteger(value['draftRevision']) ||
      etagRevision !== value['draftRevision'] ||
      !canonicalTimestamp(value['createdAt']) ||
      !canonicalTimestamp(value['updatedAt']) ||
      ('created' in value && typeof value['created'] !== 'boolean')
    )
      return this.rejectDraft();
    const result = validateFormDefinition(value['definition']);
    if (!result.success || result.value.id !== this.formId) return this.rejectDraft();
    this.definition = result.value;
    this.etag = etag;
    this.fieldsBySectionId.clear();
    this.sections.clear({ emitEvent: false });
    result.value.sections.forEach((section) => {
      this.fieldsBySectionId.set(section.id, section.fields);
      this.sections.push(sectionGroup(section.id, section.title, section.description ?? ''), {
        emitEvent: false,
      });
    });
    this.form.patchValue({
      id: result.value.id,
      title: result.value.title,
      description: result.value.description ?? '',
    });
    this.form.markAsPristine();
    this.status.set('ready');
    this.message.set('');
    return true;
  }
  private rejectDraft(): false {
    this.fail('The server returned an invalid draft.');
    return false;
  }
  private fail(message: string): void {
    this.status.set('error');
    this.message.set(message);
  }
}

type SectionFormGroup = FormGroup<{
  id: FormControl<string>;
  title: FormControl<string>;
  description: FormControl<string>;
}>;

function sectionGroup(id: string, title: string, description: string): SectionFormGroup {
  return new FormGroup({
    id: new FormControl(id, { nonNullable: true }),
    title: new FormControl(title, { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl(description, { nonNullable: true }),
  });
}

function nextIdentifier(base: string, existing: ReadonlySet<string>): string {
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
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
  return (
    parsed.success &&
    parsed.value.id === definition.id &&
    parsed.value.formVersion === 1 &&
    sameJson(parsed.value, definition)
  );
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

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameJson(item, right[index]))
    );
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null)
    return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord).sort();
  if (keys.length !== Object.keys(rightRecord).length || !keys.every((key) => key in rightRecord))
    return false;
  return keys.every((key) => sameJson(leftRecord[key], rightRecord[key]));
}
