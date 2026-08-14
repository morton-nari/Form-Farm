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
              id: 'choice',
              type: 'select' as const,
              label: 'Choose',
              options: [{ label: 'One', value: 'one' }],
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
    const save = vi.fn((_formId: string, candidate: unknown) => {
      savedDefinition = candidate;
      return of(
        new HttpResponse({
          body: {
            ...draftBody,
            draftRevision: 2,
            definition: candidate,
            updatedAt: '2026-08-14T00:01:00.000Z',
          },
          headers: new HttpHeaders({ etag: '"draft-2"' }),
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

    component.addField(0);
    expect(component.sections.at(0).controls.fields.at(1).controls.id.value).toBe('field');
    expect(document.activeElement?.id).toBe('field-label-0-1');
    component.sections.at(0).controls.fields.at(1).controls.label.setValue('Details');
    component.sections.at(0).controls.fields.at(1).controls.helpText.setValue('Tell us more.');
    component.moveField(0, 1, -1);
    expect(document.activeElement?.id).toBe('field-label-0-0');
    component.addSection();
    expect(component.sections.at(1).controls.id.value).toBe('section');
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
          fields: [{ id: 'response', type: 'text', label: 'Response' }],
        },
        {
          id: 'main',
          fields: [
            {
              id: 'field',
              type: 'text',
              label: 'Details',
              helpText: 'Tell us more.',
            },
            definition.sections[0]!.fields[0],
          ],
        },
      ],
      submission: definition.submission,
    });
    expect(component.status()).toBe('saved');
    expect(component.form.pristine).toBe(true);

    component.removeSection(0);
    expect(component.sections.length).toBe(1);
    component.removeSection(0);
    expect(component.sections.length).toBe(1);
    component.removeField(0, 0);
    expect(component.sections.at(0).controls.fields.length).toBe(1);
    component.removeField(0, 0);
    expect(component.sections.at(0).controls.fields.length).toBe(1);

    component.sections.at(0).controls.description.setValue('   ');
    component.save();
    expect(save).toHaveBeenCalledTimes(1);
    expect(component.status()).toBe('error');
    expect(component.message()).toContain('invalid builder state');
    component.sections.at(0).controls.description.setValue('');

    const editorState = component as unknown as {
      fieldSnapshotsById: Map<string, unknown>;
    };
    editorState.fieldSnapshotsById.delete('choice');
    component.save();
    expect(save).toHaveBeenCalledTimes(1);
    expect(component.status()).toBe('error');
    expect(component.message()).toContain('invalid builder state');
  });
});
