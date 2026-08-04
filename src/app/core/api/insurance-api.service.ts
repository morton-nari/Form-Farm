import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  ApplicationDefinition,
  QuoteAnswers,
  QuoteRequest,
  QuoteResponse,
} from './insurance-api.models';

@Injectable({ providedIn: 'root' })
export class InsuranceApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = '/api';

  getApplication(): Observable<ApplicationDefinition> {
    return this.http.get<ApplicationDefinition>(`${this.apiBaseUrl}/application`);
  }

  submitQuote(answers: QuoteAnswers): Observable<QuoteResponse> {
    const request: QuoteRequest = { answers };

    return this.http.post<QuoteResponse>(`${this.apiBaseUrl}/quote`, request);
  }
}
