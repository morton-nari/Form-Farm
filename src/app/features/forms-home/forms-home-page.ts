import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthenticationStore } from '../../core/auth/authentication.store';

@Component({
  selector: 'app-forms-home-page',
  imports: [RouterLink],
  template: `
    <header class="border-bottom bg-white">
      <nav
        class="container py-3 d-flex align-items-center justify-content-between"
        aria-label="Main navigation"
      >
        <a class="navbar-brand fw-bold" routerLink="/forms">Form Farm AI</a>
        <button class="btn btn-outline-secondary" type="button" (click)="logout()">Sign out</button>
      </nav>
    </header>
    <main class="container py-5" id="main-content">
      <h1>Your forms</h1>
      <p class="text-body-secondary">Choose a form to preview and submit.</p>
      <div class="card mt-4">
        <div class="card-body">
          <h2 class="h4">Customer feedback</h2>
          <p class="mb-3">The current provider-neutral sample form.</p>
          <a class="btn btn-primary" routerLink="/forms/customer-feedback">Open form</a>
        </div>
      </div>
    </main>
  `,
})
export class FormsHomePage {
  constructor(
    private readonly authentication: AuthenticationStore,
    private readonly router: Router,
  ) {}

  async logout(): Promise<void> {
    await this.authentication.logout();
    await this.router.navigateByUrl('/login');
  }
}
