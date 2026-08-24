import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DeveloperCredentialApiService {
  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<unknown>('/api/v1/management/developer-credentials');
  }

  issue(displayName: string, expiresInDays: number, currentPassword: string) {
    return this.http.post<unknown>('/api/v1/management/developer-credentials', {
      displayName,
      expiresInDays,
      currentPassword,
    });
  }

  revoke(publicId: string) {
    return this.http.delete<void>(
      `/api/v1/management/developer-credentials/${encodeURIComponent(publicId)}`,
      { body: {} },
    );
  }
}
