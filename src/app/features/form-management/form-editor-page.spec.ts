import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FormEditorPage } from './form-editor-page';

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
});
