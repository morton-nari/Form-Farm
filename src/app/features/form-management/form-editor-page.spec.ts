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
    component.form.controls.title.setValue('Unsaved title');
    component.form.controls.title.markAsDirty();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement.querySelector('.btn-success') as HTMLButtonElement).disabled,
    ).toBe(true);
    component.save();
    expect(component.status()).toBe('error');
    expect(component.message()).toContain('invalid draft');
  });
});
