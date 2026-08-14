import { HttpHeaders, HttpResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { FormEditorPage } from './form-editor-page';
import { FormManagementApiService } from '../../core/api/form-management-api.service';

describe('FormEditorPage', () => {
  it('renders the trusted minimal create workflow without schema-selected actions', async () => {
    await TestBed.configureTestingModule({
      imports: [FormEditorPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(FormEditorPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Create form');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[formControlName="id"]')).not.toBeNull();
  });

  it('disables publish for dirty visible edits and preserves error for malformed save response', async () => {
    const definition = {
      schemaVersion: 1 as const,
      id: 'my-form',
      formVersion: 1,
      title: 'My form',
      sections: [
        {
          id: 'main',
          title: 'Main',
          fields: [{ id: 'response', type: 'text' as const, label: 'Response' }],
        },
      ],
      submission: { submitLabel: 'Submit', successMessage: 'Thanks.' },
    };
    const body = {
      formId: 'my-form',
      status: 'draft',
      draftRevision: 1,
      definition,
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
    };
    const api = {
      loadDraft: () =>
        of(new HttpResponse({ body, headers: new HttpHeaders({ etag: '"draft-1"' }) })),
      save: () =>
        of(
          new HttpResponse({
            body: { invalid: true },
            headers: new HttpHeaders({ etag: '"draft-2"' }),
          }),
        ),
      publish: () => of({}),
      bootstrap: () => of(new HttpResponse()),
      create: () => of({}),
      listForms: () => of({}),
    };
    await TestBed.configureTestingModule({
      imports: [FormEditorPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'my-form' } } } },
        { provide: FormManagementApiService, useValue: api },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(FormEditorPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.canPublish()).toBe(true);
    component.form.controls.title.setValue('Unsaved title');
    component.form.controls.title.markAsDirty();
    fixture.detectChanges();
    expect(component.canPublish()).toBe(false);
    expect(
      (fixture.nativeElement.querySelector('.btn-success') as HTMLButtonElement).disabled,
    ).toBe(true);
    component.save();
    expect(component.status()).toBe('error');
    expect(component.message()).toContain('invalid draft');
  });

  it('adds, reorders, and saves sections while preserving untouched field definitions', async () => {
    const definition = {
      schemaVersion: 1 as const,
      id: 'section-form',
      formVersion: 2,
      title: 'Section form',
      sections: [
        {
          id: 'main',
          title: 'Main',
          fields: [
            {
              id: 'response',
              type: 'select' as const,
              label: 'Choose',
              options: [
                { label: 'One', value: 'one' },
                { label: 'Legacy', value: 'legacy', disabled: true },
              ],
              defaultValue: 'one',
              validation: [{ type: 'required' as const }],
            },
          ],
        },
      ],
      submission: { submitLabel: 'Send', successMessage: 'Sent.' },
    };
    const draftBody = {
      formId: definition.id,
      status: 'draft',
      draftRevision: 1,
      definition,
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
    };
    let savedDefinition: unknown;
    let savedRevision = 1;
    const save = vi.fn((_formId: string, candidate: unknown) => {
      savedDefinition = candidate;
      savedRevision += 1;
      return of(
        new HttpResponse({
          body: {
            ...draftBody,
            draftRevision: savedRevision,
            definition: candidate,
            updatedAt: '2026-08-14T00:01:00.000Z',
          },
          headers: new HttpHeaders({ etag: `"draft-${savedRevision}"` }),
        }),
      );
    });
    const api = {
      loadDraft: () =>
        of(new HttpResponse({ body: draftBody, headers: new HttpHeaders({ etag: '"draft-1"' }) })),
      save,
      publish: () => of({}),
      bootstrap: () => of(new HttpResponse()),
      create: () => of({}),
      listForms: () => of({}),
    };
    await TestBed.configureTestingModule({
      imports: [FormEditorPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => definition.id } } },
        },
        { provide: FormManagementApiService, useValue: api },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(FormEditorPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.addOption(0, 0);
    const addedOption = component.sections.at(0).controls.fields.at(0).controls.options.at(2);
    expect(addedOption.controls.value.value).toBe('option');
    expect(document.activeElement?.id).toBe('option-label-0-0-2');
    addedOption.controls.label.setValue('Two');
    addedOption.controls.value.setValue('two');
    component.moveOption(0, 0, 2, -1);
    expect(document.activeElement?.id).toBe('option-label-0-0-1');
    component.addField(0);
    expect(component.sections.at(0).controls.fields.at(1).controls.id.value).toBe('field');
    expect(document.activeElement?.id).toBe('field-label-0-1');
    component.sections.at(0).controls.fields.at(1).controls.label.setValue('Details');
    component.sections.at(0).controls.fields.at(1).controls.helpText.setValue('Tell us more.');
    component.sections.at(0).controls.fields.at(1).controls.requiredRule.setValue(true);
    component.sections.at(0).controls.fields.at(1).controls.minLength.setValue(0);
    component.sections.at(0).controls.fields.at(1).controls.maxLength.setValue(10);
    component.moveField(0, 1, -1);
    expect(document.activeElement?.id).toBe('field-label-0-0');
    expect(component.canPublish()).toBe(false);
    component.addSection();
    expect(component.sections.at(1).controls.id.value).toBe('section');
    expect(component.sections.at(1).controls.fields.at(0).controls.id.value).toBe('response-2');
    expect(document.activeElement?.id).toBe('section-title-1');
    component.sections.at(1).controls.title.setValue('Follow up');
    component.moveSection(1, -1);
    expect(document.activeElement?.id).toBe('section-title-0');
    component.save();

    expect(savedDefinition).toMatchObject({
      sections: [
        {
          id: 'section',
          title: 'Follow up',
          fields: [{ id: 'response-2', type: 'text', label: 'Response' }],
        },
        {
          id: 'main',
          fields: [
            {
              id: 'field',
              type: 'text',
              label: 'Details',
              helpText: 'Tell us more.',
              validation: [
                { type: 'required' },
                { type: 'minLength', value: 0 },
                { type: 'maxLength', value: 10 },
              ],
            },
            {
              id: 'response',
              type: 'select',
              label: 'Choose',
              options: [
                { label: 'One', value: 'one' },
                { label: 'Two', value: 'two' },
                { label: 'Legacy', value: 'legacy', disabled: true },
              ],
              defaultValue: 'one',
              validation: [{ type: 'required' }],
            },
          ],
        },
      ],
      submission: definition.submission,
    });
    expect(component.status()).toBe('saved');
    expect(component.form.pristine).toBe(true);

    const savedTextField = component.sections.at(1).controls.fields.at(0);
    savedTextField.controls.requiredRule.setValue(false);
    savedTextField.controls.minLength.setValue(null);
    savedTextField.controls.maxLength.setValue(null);
    component.save();
    expect(save).toHaveBeenCalledTimes(2);
    const savedField = (savedDefinition as { sections: { fields: { validation?: unknown }[] }[] })
      .sections[1]!.fields[0];
    expect(savedField).toMatchObject({
      id: 'field',
      type: 'text',
      label: 'Details',
      helpText: 'Tell us more.',
    });
    expect(savedField).not.toHaveProperty('validation');

    const reloadedTextField = component.sections.at(1).controls.fields.at(0);
    reloadedTextField.controls.maxLength.setValue(Number.MAX_SAFE_INTEGER);
    expect(reloadedTextField.controls.maxLength.valid).toBe(true);
    reloadedTextField.controls.maxLength.setValue(Number.MAX_SAFE_INTEGER + 1);
    expect(reloadedTextField.controls.maxLength.invalid).toBe(true);
    component.save();
    expect(save).toHaveBeenCalledTimes(2);
    reloadedTextField.controls.minLength.setValue(11);
    reloadedTextField.controls.maxLength.setValue(10);
    expect(component.form.invalid).toBe(true);
    expect(component.canPublish()).toBe(false);
    component.save();
    expect(save).toHaveBeenCalledTimes(2);
    reloadedTextField.controls.minLength.setValue(null);
    reloadedTextField.controls.maxLength.setValue(null);

    component.removeSection(0);
    expect(component.sections.length).toBe(1);
    component.removeSection(0);
    expect(component.sections.length).toBe(1);
    component.removeField(0, 0);
    expect(component.sections.at(0).controls.fields.length).toBe(1);
    component.removeField(0, 0);
    expect(component.sections.at(0).controls.fields.length).toBe(1);

    const choiceOptions = component.sections.at(0).controls.fields.at(0).controls.options;
    component.removeOption(0, 0, 0);
    expect(choiceOptions.hasError('invalidDefaultOption')).toBe(true);
    component.addOption(0, 0);
    const restoredDefault = choiceOptions.at(choiceOptions.length - 1);
    restoredDefault.controls.label.setValue('One');
    restoredDefault.controls.value.setValue('one');
    expect(choiceOptions.valid).toBe(true);
    restoredDefault.controls.value.setValue('two');
    expect(choiceOptions.hasError('duplicateOptionValue')).toBe(true);
    restoredDefault.controls.value.setValue('one');
    component.removeOption(0, 0, 0);
    component.removeOption(0, 0, 0);
    expect(choiceOptions.length).toBe(1);
    component.removeOption(0, 0, 0);
    expect(choiceOptions.length).toBe(1);

    component.sections.at(0).controls.description.setValue('   ');
    component.save();
    expect(save).toHaveBeenCalledTimes(2);
    expect(component.status()).toBe('error');
    expect(component.message()).toContain('invalid builder state');
    component.sections.at(0).controls.description.setValue('');

    const editorState = component as unknown as {
      fieldSnapshotsById: Map<string, unknown>;
    };
    editorState.fieldSnapshotsById.delete('response');
    component.save();
    expect(save).toHaveBeenCalledTimes(2);
    expect(component.status()).toBe('error');
    expect(component.message()).toContain('invalid builder state');
  });
});
