import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { FormAnswers } from '@form-farm/form-domain';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FormSubmissionApiService {
  private readonly http = inject(HttpClient);

  submit(
    formId: string,
    formVersion: number,
    answers: FormAnswers,
    idempotencyKey: string,
  ): Observable<unknown> {
    return this.http.post<unknown>(
      `/api/v1/forms/${encodeURIComponent(formId)}/submissions`,
      { formVersion, answers },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
  }
}
