import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthenticationApiService {
  constructor(private readonly http: HttpClient) {}

  bootstrapXsrf(): Observable<void> {
    return this.http.get<void>('/api/v1/auth/xsrf');
  }

  register(email: string, password: string): Observable<unknown> {
    return this.http.post<unknown>('/api/v1/auth/register', { email, password });
  }

  login(email: string, password: string): Observable<unknown> {
    return this.http.post<unknown>('/api/v1/auth/login', { email, password });
  }

  session(): Observable<unknown> {
    return this.http.get<unknown>('/api/v1/auth/session');
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/v1/auth/logout', {});
  }
}
