import { Component, ElementRef, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthenticationStore } from '../../../core/auth/authentication.store';
import { accountEmailValidator, passwordCodePointLength } from '../account-input.validators';

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.html',
  styleUrl: '../shared-auth-page.scss',
})
export class RegisterPage {
  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, accountEmailValidator],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, passwordCodePointLength(15)],
    }),
    confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly submitting = signal(false);
  readonly message = signal<string | undefined>(undefined);
  private readonly statusMessage = viewChild<ElementRef<HTMLElement>>('statusMessage');

  constructor(
    private readonly authentication: AuthenticationStore,
    private readonly router: Router,
  ) {}

  async submit(): Promise<void> {
    if (
      this.form.invalid ||
      this.form.controls.password.value !== this.form.controls.confirmPassword.value ||
      this.submitting()
    ) {
      this.form.markAllAsTouched();
      if (this.form.controls.password.value !== this.form.controls.confirmPassword.value) {
        this.message.set('Passwords must match.');
        setTimeout(() => this.statusMessage()?.nativeElement.focus());
      }
      return;
    }
    this.submitting.set(true);
    this.message.set(undefined);
    const result = await this.authentication.register(
      this.form.controls.email.value,
      this.form.controls.password.value,
    );
    this.submitting.set(false);
    if (result === 'accepted') {
      await this.router.navigate(['/login'], { queryParams: { registration: 'accepted' } });
      return;
    }
    this.message.set(
      result === 'invalid'
        ? 'Check your account details and choose a stronger password.'
        : 'We could not accept your registration. Please try again.',
    );
    setTimeout(() => this.statusMessage()?.nativeElement.focus());
  }
}
