import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import {
  DeveloperCredentialsPage,
  parseCredentialList,
  parseIssuedCredential,
} from './developer-credentials-page';

describe('DeveloperCredentialsPage', () => {
  it('loads safe metadata and returns the current password only in the issuance request', async () => {
    await TestBed.configureTestingModule({
      imports: [DeveloperCredentialsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(DeveloperCredentialsPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/v1/management/developer-credentials').flush({ credentials: [] });

    fixture.componentInstance.form.setValue({
      displayName: 'Local IDE',
      expiresInDays: 7,
      currentPassword: 'request-only-password',
    });
    const issued = fixture.componentInstance.issue();
    const request = http.expectOne('/api/v1/management/developer-credentials');
    expect(request.request.body).toEqual({
      displayName: 'Local IDE',
      expiresInDays: 7,
      currentPassword: 'request-only-password',
    });
    request.flush({ ...metadata(), credential: rawCredential });
    await issued;

    expect(fixture.componentInstance.oneTimeCredential()).toBe(rawCredential);
    expect(JSON.stringify(fixture.componentInstance.credentials())).not.toContain(rawCredential);
    expect(fixture.componentInstance.form.controls.currentPassword.value).toBe('');
    fixture.componentInstance.hideCredential();
    expect(fixture.componentInstance.oneTimeCredential()).toBeUndefined();
    fixture.componentInstance.ngOnDestroy();
    expect(fixture.componentInstance.oneTimeCredential()).toBeUndefined();
    http.verify();
  });

  it('fails closed for response fields that could expose verifier or owner data', () => {
    expect(() =>
      parseCredentialList({ credentials: [{ ...metadata(), secretHash: 'a'.repeat(64) }] }),
    ).toThrow();
    expect(() =>
      parseIssuedCredential({ ...metadata(), credential: 'not-a-credential' }),
    ).toThrow();
  });

  it('accepts only the fixed development read policy', () => {
    expect(parseCredentialList({ credentials: [metadata()] })).toEqual([metadata()]);
    expect(() =>
      parseCredentialList({
        credentials: [{ ...metadata(), environment: 'production' }],
      }),
    ).toThrow();
  });

  it('requires an explicit UI confirmation and sends only the public ID when revoking', async () => {
    await TestBed.configureTestingModule({
      imports: [DeveloperCredentialsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(DeveloperCredentialsPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/v1/management/developer-credentials').flush({
      credentials: [metadata()],
    });
    await fixture.whenStable();
    const credential = fixture.componentInstance.credentials()[0]!;
    fixture.componentInstance.requestRevocation(credential.publicId);
    expect(fixture.componentInstance.pendingRevocation()).toBe(credential.publicId);

    const revoked = fixture.componentInstance.revoke(credential);
    const request = http.expectOne(
      `/api/v1/management/developer-credentials/${credential.publicId}`,
    );
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({});
    request.flush(null);
    await revoked;
    expect(fixture.componentInstance.credentials()[0]!.revokedAt).not.toBeNull();
    expect(fixture.componentInstance.pendingRevocation()).toBeUndefined();
    http.verify();
  });
});

const rawCredential =
  'ffmcp_v1.123e4567-e89b-42d3-a456-426614174000.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function metadata() {
  return {
    publicId: '123e4567-e89b-42d3-a456-426614174000',
    displayName: 'Local IDE',
    scope: 'form-intelligence:read',
    environment: 'development',
    createdAt: '2026-08-24T00:00:00.000Z',
    expiresAt: '2026-08-31T00:00:00.000Z',
    revokedAt: null,
    lastUsedAt: null,
  };
}
