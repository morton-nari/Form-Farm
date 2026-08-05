import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { QuoteAnswers, QuoteRequest, QuoteResponse } from './insurance-api.models';

@Injectable({ providedIn: 'root' })
export class InsuranceApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = '/api';

  submitQuote(answers: QuoteAnswers): Observable<QuoteResponse> {
    const request: QuoteRequest = { answers };

    return this.http.post<QuoteResponse>(`${this.apiBaseUrl}/quote`, request);
  }
}
