import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthenticationStore } from '../../core/auth/authentication.store';
import { FormsDashboardStore } from './forms-dashboard.store';

@Component({
  selector: 'app-forms-home-page',
  imports: [RouterLink],
  providers: [FormsDashboardStore],
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
      @if (dashboard.status() === 'loading') {
        <p class="mt-4" role="status">Loading your forms&hellip;</p>
      } @else if (dashboard.status() === 'error') {
        <div class="alert alert-warning mt-4" role="alert">
          <p>We could not load your forms.</p>
          <button class="btn btn-outline-secondary" type="button" (click)="dashboard.load()">Try again</button>
        </div>
      } @else if (dashboard.forms().length === 0) {
        <p class="mt-4">No forms are available yet.</p>
      } @else {
        <div class="row g-4 mt-1" aria-label="Available forms">
          @for (form of dashboard.forms(); track form.id) {
            <article class="col-12 col-md-6 col-xl-4">
              <div class="card h-100"><div class="card-body d-flex flex-column">
                <h2 class="h4">{{ form.title }}</h2>
                <p class="text-body-secondary">Version {{ form.formVersion }}</p>
                <a class="btn btn-primary mt-auto align-self-start" [routerLink]="['/forms', form.id]">Open form</a>
              </div></div>
            </article>
          }
        </div>
      }
    </main>
  `,
})
export class FormsHomePage implements OnInit {
  constructor(
    private readonly authentication: AuthenticationStore,
    private readonly router: Router,
    readonly dashboard: FormsDashboardStore,
  ) {}

  ngOnInit(): void {
    this.dashboard.load();
  }

  async logout(): Promise<void> {
    await this.authentication.logout();
    await this.router.navigateByUrl('/login');
  }
}
