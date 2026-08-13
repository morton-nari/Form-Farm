import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FormsDashboardApiService {
  constructor(private readonly http: HttpClient) {}

  listForms(): Observable<unknown> {
    return this.http.get<unknown>('/api/v1/forms');
  }
}
