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
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FORM_IDENTIFIER_PATTERN,
  validateFormDefinition,
  type FormDefinition,
  type FormField,
  type FormFieldOption,
  type FormSection,
  type NumberValidationRule,
  type TextValidationRule,
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
              <fieldset class="border rounded p-3 mt-3" formArrayName="fields">
                <legend class="float-none w-auto px-2 fs-6">Fields</legend>
                @for (
                  field of section.controls.fields.controls;
                  track field.controls.id.value;
                  let fieldIndex = $index
                ) {
                  <div class="bg-body-tertiary rounded p-3 mb-3" [formGroupName]="fieldIndex">
                    <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
                      <h3 class="h6 mb-0">
                        Field {{ fieldIndex + 1 }} · {{ field.controls.type.value }}
                      </h3>
                      <div class="btn-group" aria-label="Field order and removal">
                        <button
                          class="btn btn-sm btn-outline-secondary"
                          type="button"
                          [disabled]="fieldIndex === 0"
                          (click)="moveField(index, fieldIndex, -1)"
                          [attr.aria-label]="'Move field ' + (fieldIndex + 1) + ' up'"
                        >
                          Move up
                        </button>
                        <button
                          class="btn btn-sm btn-outline-secondary"
                          type="button"
                          [disabled]="fieldIndex === section.controls.fields.length - 1"
                          (click)="moveField(index, fieldIndex, 1)"
                          [attr.aria-label]="'Move field ' + (fieldIndex + 1) + ' down'"
                        >
                          Move down
                        </button>
                        <button
                          class="btn btn-sm btn-outline-danger"
                          type="button"
                          [disabled]="section.controls.fields.length === 1"
                          (click)="removeField(index, fieldIndex)"
                          [attr.aria-label]="'Remove field ' + (fieldIndex + 1)"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <label class="form-label" [for]="'field-label-' + index + '-' + fieldIndex"
                      >Field label</label
                    >
                    <input
                      #fieldLabel
                      class="form-control mb-3"
                      [id]="'field-label-' + index + '-' + fieldIndex"
                      formControlName="label"
                    />
                    <label class="form-label" [for]="'field-help-' + index + '-' + fieldIndex"
                      >Help text</label
                    >
                    <textarea
                      class="form-control"
                      [id]="'field-help-' + index + '-' + fieldIndex"
                      formControlName="helpText"
                    ></textarea>
                    @if (supportsTextValidation(field.controls.type.value)) {
                      <fieldset class="border-top mt-3 pt-3">
                        <legend class="fs-6">Text validation</legend>
                        <div class="form-check mb-3">
                          <input
                            class="form-check-input"
                            type="checkbox"
                            [id]="'field-required-' + index + '-' + fieldIndex"
                            formControlName="requiredRule"
                          />
                          <label
                            class="form-check-label"
                            [for]="'field-required-' + index + '-' + fieldIndex"
                            >Required</label
                          >
                        </div>
                        <div class="row g-3">
                          <div class="col-md-6">
                            <label
                              class="form-label"
                              [for]="'field-min-length-' + index + '-' + fieldIndex"
                              >Minimum length</label
                            >
                            <input
                              class="form-control"
                              type="number"
                              min="0"
                              step="1"
                              [id]="'field-min-length-' + index + '-' + fieldIndex"
                              formControlName="minLength"
                            />
                          </div>
                          <div class="col-md-6">
                            <label
                              class="form-label"
                              [for]="'field-max-length-' + index + '-' + fieldIndex"
                              >Maximum length</label
                            >
                            <input
                              class="form-control"
                              type="number"
                              min="0"
                              step="1"
                              [id]="'field-max-length-' + index + '-' + fieldIndex"
                              formControlName="maxLength"
                            />
                          </div>
                        </div>
                        @if (field.hasError('invalidLengthRange')) {
                          <p class="text-danger mt-2 mb-0" role="alert">
                            Minimum length cannot exceed maximum length.
                          </p>
                        }
                      </fieldset>
                    }
                    @if (field.controls.type.value === 'number') {
                      <fieldset class="border-top mt-3 pt-3">
                        <legend class="fs-6">Number validation</legend>
                        <div class="d-flex flex-wrap gap-4 mb-3">
                          <div class="form-check">
                            <input
                              class="form-check-input"
                              type="checkbox"
                              [id]="'number-required-' + index + '-' + fieldIndex"
                              formControlName="numberRequired"
                            />
                            <label
                              class="form-check-label"
                              [for]="'number-required-' + index + '-' + fieldIndex"
                              >Required</label
                            >
                          </div>
                          <div class="form-check">
                            <input
                              class="form-check-input"
                              type="checkbox"
                              [id]="'number-integer-' + index + '-' + fieldIndex"
                              formControlName="numberInteger"
                            />
                            <label
                              class="form-check-label"
                              [for]="'number-integer-' + index + '-' + fieldIndex"
                              >Whole numbers only</label
                            >
                          </div>
                        </div>
                        <div class="row g-3">
                          <div class="col-md-6">
                            <label
                              class="form-label"
                              [for]="'number-min-' + index + '-' + fieldIndex"
                              >Minimum</label
                            >
                            <input
                              class="form-control"
                              type="number"
                              step="any"
                              [id]="'number-min-' + index + '-' + fieldIndex"
                              formControlName="numberMin"
                            />
                          </div>
                          <div class="col-md-6">
                            <label
                              class="form-label"
                              [for]="'number-max-' + index + '-' + fieldIndex"
                              >Maximum</label
                            >
                            <input
                              class="form-control"
                              type="number"
                              step="any"
                              [id]="'number-max-' + index + '-' + fieldIndex"
                              formControlName="numberMax"
                            />
                          </div>
                        </div>
                        @if (field.hasError('invalidNumberRange')) {
                          <p class="text-danger mt-2 mb-0" role="alert">
                            Minimum cannot exceed maximum.
                          </p>
                        }
                      </fieldset>
                    }
                    @if (supportsChoiceOptions(field.controls.type.value)) {
                      <fieldset class="border-top mt-3 pt-3" formArrayName="options">
                        <legend class="fs-6">Options</legend>
                        @for (
                          option of field.controls.options.controls;
                          track option;
                          let optionIndex = $index
                        ) {
                          <div class="border rounded p-3 mb-3" [formGroupName]="optionIndex">
                            <div class="d-flex justify-content-between gap-2 mb-3">
                              <strong>Option {{ optionIndex + 1 }}</strong>
                              <div class="btn-group" aria-label="Option order and removal">
                                <button
                                  class="btn btn-sm btn-outline-secondary"
                                  type="button"
                                  [disabled]="optionIndex === 0"
                                  (click)="moveOption(index, fieldIndex, optionIndex, -1)"
                                >
                                  Move up
                                </button>
                                <button
                                  class="btn btn-sm btn-outline-secondary"
                                  type="button"
                                  [disabled]="optionIndex === field.controls.options.length - 1"
                                  (click)="moveOption(index, fieldIndex, optionIndex, 1)"
                                >
                                  Move down
                                </button>
                                <button
                                  class="btn btn-sm btn-outline-danger"
                                  type="button"
                                  [disabled]="field.controls.options.length === 1"
                                  (click)="removeOption(index, fieldIndex, optionIndex)"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            <div class="row g-3">
                              <div class="col-md-6">
                                <label
                                  class="form-label"
                                  [for]="
                                    'option-label-' + index + '-' + fieldIndex + '-' + optionIndex
                                  "
                                  >Label</label
                                >
                                <input
                                  #optionLabel
                                  class="form-control"
                                  [id]="
                                    'option-label-' + index + '-' + fieldIndex + '-' + optionIndex
                                  "
                                  formControlName="label"
                                />
                              </div>
                              <div class="col-md-6">
                                <label
                                  class="form-label"
                                  [for]="
                                    'option-value-' + index + '-' + fieldIndex + '-' + optionIndex
                                  "
                                  >Submitted value</label
                                >
                                <input
                                  class="form-control"
                                  [id]="
                                    'option-value-' + index + '-' + fieldIndex + '-' + optionIndex
                                  "
                                  formControlName="value"
                                />
                              </div>
                            </div>
                          </div>
                        }
                        @if (field.controls.options.hasError('duplicateOptionValue')) {
                          <p class="text-danger" role="alert">Option values must be unique.</p>
                        }
                        @if (field.controls.options.hasError('invalidDefaultOption')) {
                          <p class="text-danger" role="alert">
                            An existing default must remain an enabled option.
                          </p>
                        }
                        <button
                          class="btn btn-sm btn-outline-primary"
                          type="button"
                          (click)="addOption(index, fieldIndex)"
                        >
                          Add option
                        </button>
                      </fieldset>
                    }
                  </div>
                }
                <div class="row g-2 align-items-end">
                  <div class="col-sm-6">
                    <label class="form-label" [for]="'new-field-type-' + index">Field type</label>
                    <select
                      class="form-select"
                      [id]="'new-field-type-' + index"
                      [formControl]="section.controls.newFieldType"
                    >
                      @for (fieldType of creatableFieldTypes; track fieldType.type) {
                        <option [value]="fieldType.type">{{ fieldType.label }}</option>
                      }
                    </select>
                  </div>
                  <div class="col-sm-auto">
                    <button
                      class="btn btn-sm btn-outline-primary"
                      type="button"
                      (click)="addField(index)"
                    >
                      Add field
                    </button>
                  </div>
                </div>
              </fieldset>
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
              [disabled]="!canPublish()"
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
  @ViewChildren('fieldLabel') private readonly fieldLabels!: QueryList<
    ElementRef<HTMLInputElement>
  >;
  @ViewChildren('optionLabel') private readonly optionLabels!: QueryList<
    ElementRef<HTMLInputElement>
  >;
  private readonly route = inject(ActivatedRoute);
  readonly creatableFieldTypes = CREATABLE_FIELD_TYPES;
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
  private readonly fieldSnapshotsById = new Map<string, FormField>();

  get sections(): FormArray<SectionFormGroup> {
    return this.form.controls.sections;
  }
  constructor(
    private readonly router: Router,
    private readonly api: FormManagementApiService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    if (!this.formId) {
      const field: FormField = { id: 'response', type: 'text', label: 'Response' };
      this.fieldSnapshotsById.set(field.id, field);
      this.sections.push(sectionGroup('main', 'Main', '', [field]), { emitEvent: false });
    }
  }
  ngOnInit(): void {
    if (this.formId) this.loadDraft();
  }
  save(): void {
    if (this.form.invalid) return;
    if (!this.formId) return this.create();
    if (!this.definition || !this.etag) return this.fail('Reload the draft before saving.');
    const sections = this.buildSections();
    if (!sections) return;
    const candidate = {
      ...this.definition,
      title: this.form.controls.title.value,
      sections,
    };
    if (this.form.controls.description.value)
      candidate.description = this.form.controls.description.value;
    else delete candidate.description;
    const validatedCandidate = validateFormDefinition(candidate);
    if (!validatedCandidate.success) return this.fail('The draft contains invalid builder state.');
    this.status.set('saving');
    this.api
      .save(this.formId, validatedCandidate.value, this.etag)
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
    const existingFieldIds = new Set(this.fieldSnapshotsById.keys());
    const fieldId = nextIdentifier('response', existingFieldIds);
    const field: FormField = { id: fieldId, type: 'text', label: 'Response' };
    this.fieldSnapshotsById.set(fieldId, field);
    this.sections.push(sectionGroup(sectionId, `Section ${this.sections.length + 1}`, '', [field]));
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
    removed.controls.fields.controls.forEach((field) =>
      this.fieldSnapshotsById.delete(field.controls.id.value),
    );
    this.form.markAsDirty();
    this.focusSection(Math.min(index, this.sections.length - 1));
  }
  addField(sectionIndex: number): void {
    const section = this.sections.at(sectionIndex);
    if (!section) return;
    const fieldId = nextIdentifier('field', new Set(this.fieldSnapshotsById.keys()));
    const field = createStarterField(
      section.controls.newFieldType.value,
      fieldId,
      `Field ${section.controls.fields.length + 1}`,
    );
    this.fieldSnapshotsById.set(fieldId, field);
    section.controls.fields.push(fieldGroup(field));
    this.form.markAsDirty();
    this.focusField(sectionIndex, section.controls.fields.length - 1);
  }
  moveField(sectionIndex: number, fieldIndex: number, offset: -1 | 1): void {
    const fields = this.sections.at(sectionIndex)?.controls.fields;
    if (!fields) return;
    const target = fieldIndex + offset;
    if (fieldIndex < 0 || fieldIndex >= fields.length || target < 0 || target >= fields.length)
      return;
    const field = fields.at(fieldIndex);
    fields.removeAt(fieldIndex, { emitEvent: false });
    fields.insert(target, field, { emitEvent: false });
    this.form.markAsDirty();
    this.focusField(sectionIndex, target);
  }
  removeField(sectionIndex: number, fieldIndex: number): void {
    const fields = this.sections.at(sectionIndex)?.controls.fields;
    if (!fields || fields.length <= 1 || fieldIndex < 0 || fieldIndex >= fields.length) return;
    const removed = fields.at(fieldIndex);
    fields.removeAt(fieldIndex);
    this.fieldSnapshotsById.delete(removed.controls.id.value);
    this.form.markAsDirty();
    this.focusField(sectionIndex, Math.min(fieldIndex, fields.length - 1));
  }
  supportsTextValidation(type: FormField['type']): boolean {
    return isTextEntryType(type);
  }
  supportsChoiceOptions(type: FormField['type']): boolean {
    return isChoiceType(type);
  }
  addOption(sectionIndex: number, fieldIndex: number): void {
    const options = this.sections.at(sectionIndex)?.controls.fields.at(fieldIndex)
      ?.controls.options;
    if (!options) return;
    const value = nextIdentifier(
      'option',
      new Set(options.controls.map((option) => option.controls.value.value)),
    );
    options.push(optionGroup({ label: `Option ${options.length + 1}`, value }));
    this.form.markAsDirty();
    this.focusOption(sectionIndex, fieldIndex, options.length - 1);
  }
  moveOption(sectionIndex: number, fieldIndex: number, optionIndex: number, offset: -1 | 1): void {
    const options = this.sections.at(sectionIndex)?.controls.fields.at(fieldIndex)
      ?.controls.options;
    if (!options) return;
    const target = optionIndex + offset;
    if (optionIndex < 0 || optionIndex >= options.length || target < 0 || target >= options.length)
      return;
    const option = options.at(optionIndex);
    options.removeAt(optionIndex, { emitEvent: false });
    options.insert(target, option, { emitEvent: false });
    options.updateValueAndValidity();
    this.form.markAsDirty();
    this.focusOption(sectionIndex, fieldIndex, target);
  }
  removeOption(sectionIndex: number, fieldIndex: number, optionIndex: number): void {
    const options = this.sections.at(sectionIndex)?.controls.fields.at(fieldIndex)
      ?.controls.options;
    if (!options || options.length <= 1 || optionIndex < 0 || optionIndex >= options.length) return;
    options.removeAt(optionIndex);
    this.form.markAsDirty();
    this.focusOption(sectionIndex, fieldIndex, Math.min(optionIndex, options.length - 1));
  }
  canPublish(): boolean {
    return (
      this.status() !== 'saving' &&
      this.form.valid &&
      !this.form.dirty &&
      this.definition !== undefined &&
      this.etag !== undefined
    );
  }
  private focusSection(index: number): void {
    this.changeDetector.detectChanges();
    this.sectionTitles.get(index)?.nativeElement.focus();
  }
  private focusField(sectionIndex: number, fieldIndex: number): void {
    this.changeDetector.detectChanges();
    const precedingFieldCount = this.sections.controls
      .slice(0, sectionIndex)
      .reduce((count, section) => count + section.controls.fields.length, 0);
    this.fieldLabels.get(precedingFieldCount + fieldIndex)?.nativeElement.focus();
  }
  private focusOption(sectionIndex: number, fieldIndex: number, optionIndex: number): void {
    this.changeDetector.detectChanges();
    let precedingOptionCount = 0;
    this.sections.controls.forEach((section, currentSectionIndex) => {
      section.controls.fields.controls.forEach((field, currentFieldIndex) => {
        if (
          currentSectionIndex < sectionIndex ||
          (currentSectionIndex === sectionIndex && currentFieldIndex < fieldIndex)
        )
          precedingOptionCount += field.controls.options.length;
      });
    });
    this.optionLabels.get(precedingOptionCount + optionIndex)?.nativeElement.focus();
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
    const sections = this.buildSections();
    if (!sections) return;
    const candidate = {
      schemaVersion: 1,
      id: value.id,
      formVersion: 1,
      title: value.title,
      ...(value.description ? { description: value.description } : {}),
      sections,
      submission: { submitLabel: 'Submit', successMessage: 'Thank you.' },
    };
    const validatedDefinition = validateFormDefinition(candidate);
    if (!validatedDefinition.success) return this.fail('The draft contains invalid builder state.');
    const definition = validatedDefinition.value;
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
  private buildSections(): readonly FormSection[] | undefined {
    const sections: FormSection[] = [];
    for (const section of this.sections.controls) {
      const value = section.getRawValue();
      const fields: FormField[] = [];
      for (const field of section.controls.fields.controls) {
        const fieldValue = field.getRawValue();
        const snapshot = this.fieldSnapshotsById.get(fieldValue.id);
        if (!snapshot || snapshot.type !== fieldValue.type) {
          this.fail('The draft contains invalid builder state. Reload the draft.');
          return undefined;
        }
        const updated = { ...snapshot, label: fieldValue.label } as FormField & {
          helpText?: string;
        };
        if (fieldValue.helpText) updated.helpText = fieldValue.helpText;
        else delete updated.helpText;
        fields.push(
          isTextEntryField(updated)
            ? withTextValidation(
                updated,
                fieldValue.requiredRule,
                fieldValue.minLength,
                fieldValue.maxLength,
              )
            : updated.type === 'number'
              ? withNumberValidation(
                  updated,
                  fieldValue.numberRequired,
                  fieldValue.numberMin,
                  fieldValue.numberMax,
                  fieldValue.numberInteger,
                )
              : isChoiceField(updated)
                ? withChoiceOptions(updated, field.controls.options.getRawValue())
                : updated,
        );
      }
      sections.push({
        id: value.id,
        title: value.title,
        ...(value.description ? { description: value.description } : {}),
        fields,
      });
    }
    return sections;
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
    this.fieldSnapshotsById.clear();
    this.sections.clear({ emitEvent: false });
    result.value.sections.forEach((section) => {
      section.fields.forEach((field) => this.fieldSnapshotsById.set(field.id, field));
      this.sections.push(
        sectionGroup(section.id, section.title, section.description ?? '', section.fields),
        { emitEvent: false },
      );
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
  fields: FormArray<FieldFormGroup>;
  newFieldType: FormControl<CreatableFieldType>;
}>;

type FieldFormGroup = FormGroup<{
  id: FormControl<string>;
  type: FormControl<FormField['type']>;
  label: FormControl<string>;
  helpText: FormControl<string>;
  requiredRule: FormControl<boolean>;
  minLength: FormControl<number | null>;
  maxLength: FormControl<number | null>;
  numberRequired: FormControl<boolean>;
  numberMin: FormControl<number | null>;
  numberMax: FormControl<number | null>;
  numberInteger: FormControl<boolean>;
  options: FormArray<OptionFormGroup>;
}>;

type OptionFormGroup = FormGroup<{
  label: FormControl<string>;
  value: FormControl<string>;
  disabled: FormControl<boolean>;
}>;

function sectionGroup(
  id: string,
  title: string,
  description: string,
  fields: readonly FormField[],
): SectionFormGroup {
  return new FormGroup({
    id: new FormControl(id, { nonNullable: true }),
    title: new FormControl(title, { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl(description, { nonNullable: true }),
    fields: new FormArray(fields.map(fieldGroup)),
    newFieldType: new FormControl<CreatableFieldType>('text', { nonNullable: true }),
  });
}

function fieldGroup(field: FormField): FieldFormGroup {
  const textRules = isTextEntryField(field) ? field.validation : undefined;
  const numberRules = field.type === 'number' ? field.validation : undefined;
  const options = isChoiceField(field) ? field.options : [];
  const defaults = isChoiceField(field)
    ? Array.isArray(field.defaultValue)
      ? field.defaultValue
      : field.defaultValue === undefined
        ? []
        : [field.defaultValue]
    : [];
  return new FormGroup(
    {
      id: new FormControl(field.id, { nonNullable: true }),
      type: new FormControl(field.type, { nonNullable: true }),
      label: new FormControl(field.label, { nonNullable: true, validators: [Validators.required] }),
      helpText: new FormControl(field.helpText ?? '', { nonNullable: true }),
      requiredRule: new FormControl(textRules?.some((rule) => rule.type === 'required') ?? false, {
        nonNullable: true,
      }),
      minLength: new FormControl(ruleValue(textRules, 'minLength'), {
        validators: [nonNegativeSafeInteger],
      }),
      maxLength: new FormControl(ruleValue(textRules, 'maxLength'), {
        validators: [nonNegativeSafeInteger],
      }),
      numberRequired: new FormControl(
        numberRules?.some((rule) => rule.type === 'required') ?? false,
        { nonNullable: true },
      ),
      numberMin: new FormControl(numberRuleValue(numberRules, 'min'), {
        validators: [finiteNumber],
      }),
      numberMax: new FormControl(numberRuleValue(numberRules, 'max'), {
        validators: [finiteNumber],
      }),
      numberInteger: new FormControl(
        numberRules?.some((rule) => rule.type === 'integer') ?? false,
        { nonNullable: true },
      ),
      options: new FormArray(
        options.map(optionGroup),
        isChoiceField(field) ? { validators: [choiceOptionsValidator(defaults)] } : undefined,
      ),
    },
    { validators: [validLengthRange, validNumberRange] },
  );
}

function optionGroup(option: FormFieldOption): OptionFormGroup {
  return new FormGroup({
    label: new FormControl(option.label, {
      nonNullable: true,
      validators: [Validators.required, nonBlankText],
    }),
    value: new FormControl(option.value, {
      nonNullable: true,
      validators: [Validators.required, nonBlankText],
    }),
    disabled: new FormControl(option.disabled ?? false, { nonNullable: true }),
  });
}

const TEXT_ENTRY_TYPES = new Set<FormField['type']>([
  'text',
  'email',
  'password',
  'tel',
  'url',
  'textarea',
]);

type TextEntryField = Extract<
  FormField,
  { type: 'text' | 'email' | 'password' | 'tel' | 'url' | 'textarea' }
>;

type ChoiceField = Extract<
  FormField,
  { type: 'select' | 'radio' | 'multi-select' | 'checkbox-group' }
>;

function isChoiceType(type: FormField['type']): type is ChoiceField['type'] {
  return ['select', 'radio', 'multi-select', 'checkbox-group'].includes(type);
}

function isChoiceField(field: FormField): field is ChoiceField {
  return isChoiceType(field.type);
}

function isTextEntryType(type: FormField['type']): type is TextEntryField['type'] {
  return TEXT_ENTRY_TYPES.has(type);
}

function isTextEntryField(field: FormField): field is TextEntryField {
  return isTextEntryType(field.type);
}

function ruleValue(
  rules: readonly TextValidationRule[] | undefined,
  type: 'minLength' | 'maxLength',
): number | null {
  const rule = rules?.find((candidate) => candidate.type === type);
  return rule && 'value' in rule ? rule.value : null;
}

function numberRuleValue(
  rules: readonly NumberValidationRule[] | undefined,
  type: 'min' | 'max',
): number | null {
  const rule = rules?.find((candidate) => candidate.type === type);
  return rule && 'value' in rule ? rule.value : null;
}

function nonNegativeSafeInteger(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0)
    ? null
    : { nonNegativeSafeInteger: true };
}

function nonBlankText(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim().length > 0
    ? null
    : { nonBlankText: true };
}

function finiteNumber(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  return value === null || (typeof value === 'number' && Number.isFinite(value))
    ? null
    : { finiteNumber: true };
}

function choiceOptionsValidator(defaults: readonly string[]) {
  return (control: AbstractControl): ValidationErrors | null => {
    const options = control.value as readonly FormFieldOption[];
    if (!Array.isArray(options) || options.length < 1) return { minimumOptions: true };
    const values = options.map((option) => option.value);
    if (new Set(values).size !== values.length) return { duplicateOptionValue: true };
    const enabledValues = new Set(
      options.filter((option) => !option.disabled).map((option) => option.value),
    );
    return defaults.every((value) => enabledValues.has(value))
      ? null
      : { invalidDefaultOption: true };
  };
}

function validLengthRange(control: AbstractControl): ValidationErrors | null {
  const minLength: unknown = control.get('minLength')?.value;
  const maxLength: unknown = control.get('maxLength')?.value;
  return typeof minLength === 'number' && typeof maxLength === 'number' && minLength > maxLength
    ? { invalidLengthRange: true }
    : null;
}

function validNumberRange(control: AbstractControl): ValidationErrors | null {
  const min: unknown = control.get('numberMin')?.value;
  const max: unknown = control.get('numberMax')?.value;
  return typeof min === 'number' && typeof max === 'number' && min > max
    ? { invalidNumberRange: true }
    : null;
}

function withTextValidation(
  field: TextEntryField,
  required: boolean,
  minLength: number | null,
  maxLength: number | null,
): TextEntryField {
  const validation: TextValidationRule[] = [];
  if (required) validation.push({ type: 'required' });
  if (minLength !== null) validation.push({ type: 'minLength', value: minLength });
  if (maxLength !== null) validation.push({ type: 'maxLength', value: maxLength });
  const updated = { ...field } as TextEntryField & { validation?: readonly TextValidationRule[] };
  if (validation.length > 0) updated.validation = validation;
  else delete updated.validation;
  return updated;
}

function withNumberValidation(
  field: Extract<FormField, { type: 'number' }>,
  required: boolean,
  min: number | null,
  max: number | null,
  integer: boolean,
): Extract<FormField, { type: 'number' }> {
  const validation: NumberValidationRule[] = [];
  if (required) validation.push({ type: 'required' });
  if (min !== null) validation.push({ type: 'min', value: min });
  if (max !== null) validation.push({ type: 'max', value: max });
  if (integer) validation.push({ type: 'integer' });
  const updated = { ...field } as Extract<FormField, { type: 'number' }> & {
    validation?: readonly NumberValidationRule[];
  };
  if (validation.length > 0) updated.validation = validation;
  else delete updated.validation;
  return updated;
}

function withChoiceOptions(
  field: ChoiceField,
  options: readonly { label: string; value: string; disabled: boolean }[],
): ChoiceField {
  return {
    ...field,
    options: options.map((option) => ({
      label: option.label,
      value: option.value,
      ...(option.disabled ? { disabled: true } : {}),
    })),
  };
}

const FIELD_CREATION_POLICY = {
  text: 'Text',
  email: 'Email',
  password: null,
  tel: 'Telephone',
  url: 'URL',
  textarea: 'Long text',
  number: 'Number',
  date: 'Date',
  datetime: 'Date and time',
  time: 'Time',
  select: 'Select list',
  radio: 'Radio buttons',
  'multi-select': 'Multi-select list',
  checkbox: 'Checkbox',
  'checkbox-group': 'Checkbox group',
} as const satisfies Record<FormField['type'], string | null>;

type CreatableFieldType = {
  [Type in keyof typeof FIELD_CREATION_POLICY]: (typeof FIELD_CREATION_POLICY)[Type] extends string
    ? Type
    : never;
}[keyof typeof FIELD_CREATION_POLICY];

const CREATABLE_FIELD_TYPE_ORDER = [
  'text',
  'email',
  'tel',
  'url',
  'textarea',
  'number',
  'date',
  'datetime',
  'time',
  'select',
  'radio',
  'multi-select',
  'checkbox',
  'checkbox-group',
] as const satisfies readonly CreatableFieldType[];

const CREATABLE_FIELD_TYPES = CREATABLE_FIELD_TYPE_ORDER.map((type) => ({
  type,
  label: FIELD_CREATION_POLICY[type],
}));

function createStarterField(type: CreatableFieldType, id: string, label: string): FormField {
  switch (type) {
    case 'text':
    case 'email':
    case 'tel':
    case 'url':
    case 'textarea':
    case 'number':
    case 'date':
    case 'datetime':
    case 'time':
    case 'checkbox':
      return { id, type, label };
    case 'select':
    case 'radio':
    case 'multi-select':
    case 'checkbox-group':
      return { id, type, label, options: [{ label: 'Option 1', value: 'option' }] };
    default:
      return assertNever(type);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported creatable field type: ${String(value)}`);
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
