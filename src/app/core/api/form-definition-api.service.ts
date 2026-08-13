import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FormDefinitionApiService {
  private readonly http = inject(HttpClient);

  getFormDefinition(formId: string): Observable<unknown> {
    return this.http.get<unknown>(`/api/v1/forms/${encodeURIComponent(formId)}`);
  }
}
