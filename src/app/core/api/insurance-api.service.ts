import { HttpClient } from '@angular/common/http';
import { inject, Injectable, isDevMode } from '@angular/core';
import { Observable, tap } from 'rxjs';

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
  private readonly upstreamApiBaseUrl =
    'https://insurance-quote-api-f4h7ebg2hrg8f3gh.australiasoutheast-01.azurewebsites.net';

  getApplication(): Observable<ApplicationDefinition> {
    const endpoint = '/application';

    return this.http
      .get<ApplicationDefinition>(`${this.apiBaseUrl}${endpoint}`)
      .pipe(tap((response) => this.logResponse('GET', endpoint, response)));
  }

  submitQuote(answers: QuoteAnswers): Observable<QuoteResponse> {
    const request: QuoteRequest = { answers };

    const endpoint = '/quote';

    return this.http
      .post<QuoteResponse>(`${this.apiBaseUrl}${endpoint}`, request)
      .pipe(tap((response) => this.logResponse('POST', endpoint, response)));
  }

  private logResponse(
    method: 'GET' | 'POST',
    endpoint: string,
    response: ApplicationDefinition | QuoteResponse,
  ): void {
    if (!isDevMode()) {
      return;
    }

    console.log(`[Insurance API] ${method} ${this.upstreamApiBaseUrl}${endpoint}`, {
      browserRequestUrl: `${this.apiBaseUrl}${endpoint}`,
      upstreamRequestUrl: `${this.upstreamApiBaseUrl}${endpoint}`,
      response,
    });
  }
}
