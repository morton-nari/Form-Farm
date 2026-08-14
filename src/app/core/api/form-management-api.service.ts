import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { FormDefinition } from '@form-farm/form-domain';

@Injectable({ providedIn: 'root' })
export class FormManagementApiService {
  constructor(private readonly http: HttpClient) {}
  listForms(cursor?: string): Observable<unknown> {
    return this.http.get<unknown>('/api/v1/management/forms', {
      params: cursor ? { limit: 20, cursor } : { limit: 20 },
    });
  }
  create(definition: FormDefinition): Observable<unknown> {
    return this.http.post<unknown>('/api/v1/management/forms', { definition });
  }
  loadDraft(formId: string) {
    return this.http.get<unknown>(`/api/v1/management/forms/${encodeURIComponent(formId)}/draft`, {
      observe: 'response' as const,
    });
  }
  bootstrap(formId: string) {
    return this.http.post<unknown>(
      `/api/v1/management/forms/${encodeURIComponent(formId)}/draft`,
      {},
      { observe: 'response' as const },
    );
  }
  save(formId: string, definition: FormDefinition, etag: string) {
    return this.http.put<unknown>(
      `/api/v1/management/forms/${encodeURIComponent(formId)}/draft`,
      { definition },
      { headers: { 'If-Match': etag }, observe: 'response' as const },
    );
  }
  publish(formId: string, etag: string): Observable<unknown> {
    return this.http.post<unknown>(
      `/api/v1/management/forms/${encodeURIComponent(formId)}/publications`,
      {},
      { headers: { 'If-Match': etag } },
    );
  }
}
