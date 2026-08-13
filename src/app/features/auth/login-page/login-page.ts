import { Component, ElementRef, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthenticationStore } from '../../../core/auth/authentication.store';
import { accountEmailValidator, passwordCodePointLength } from '../account-input.validators';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: '../shared-auth-page.scss',
})
export class LoginPage {
  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, accountEmailValidator],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, passwordCodePointLength(1)],
    }),
  });
  readonly submitting = signal(false);
  readonly message = signal<string | undefined>(undefined);
  readonly registrationAccepted: boolean;
  private readonly statusMessage = viewChild<ElementRef<HTMLElement>>('statusMessage');

  constructor(
    private readonly authentication: AuthenticationStore,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    this.registrationAccepted =
      this.route.snapshot.queryParamMap.get('registration') === 'accepted';
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.message.set(undefined);
    const result = await this.authentication.login(
      this.form.controls.email.value,
      this.form.controls.password.value,
    );
    this.submitting.set(false);
    if (result === 'authenticated') {
      const requested = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(safeReturnUrl(requested));
      return;
    }
    this.message.set(
      result === 'invalid'
        ? 'The email or password is incorrect.'
        : 'We could not sign you in. Please try again.',
    );
    setTimeout(() => this.statusMessage()?.nativeElement.focus());
  }
}

export function safeReturnUrl(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/forms';
  }
  try {
    const parsed = new URL(value, 'https://form-farm.invalid');
    return parsed.origin === 'https://form-farm.invalid' &&
      (parsed.pathname === '/forms' || parsed.pathname.startsWith('/forms/'))
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : '/forms';
  } catch {
    return '/forms';
  }
}
