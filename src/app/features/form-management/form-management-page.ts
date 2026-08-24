import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormManagementApiService } from '../../core/api/form-management-api.service';
import { take } from 'rxjs';
import { FormManagementStore } from './form-management.store';

@Component({
  selector: 'app-form-management-page',
  imports: [RouterLink],
  providers: [FormManagementStore],
  template: ` <header class="border-bottom bg-white">
      <nav class="container py-3 d-flex justify-content-between" aria-label="Management navigation">
        <a class="navbar-brand fw-bold" routerLink="/forms">Form Farm AI</a>
        <div class="d-flex gap-2">
          <a class="btn btn-outline-primary" routerLink="/manage/developer-credentials"
            >Developer credentials</a
          >
          <a class="btn btn-outline-secondary" routerLink="/forms">Available forms</a>
        </div>
      </nav>
    </header>
    <main class="container py-5" id="main-content">
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div>
          <h1>Manage forms</h1>
          <p class="text-body-secondary">Create, edit, and publish forms you own.</p>
        </div>
        <a class="btn btn-primary" routerLink="/manage/forms/new">Create form</a>
      </div>
      @if (management.status() === 'loading') {
        <p role="status">Loading managed forms&hellip;</p>
      } @else if (management.status() === 'error') {
        <div class="alert alert-warning" role="alert">
          We could not load your managed forms.
          <button class="btn btn-link" type="button" (click)="management.load()">Try again</button>
        </div>
      } @else if (management.forms().length === 0) {
        <p>No owner forms yet.</p>
      } @else {
        <div class="row g-4" aria-label="Managed forms">
          @for (form of management.forms(); track form.id) {
            <article class="col-12 col-md-6">
              <div class="card h-100">
                <div class="card-body">
                  <div class="d-flex justify-content-between">
                    <h2 class="h4">{{ form.title }}</h2>
                    <span class="badge text-bg-secondary text-capitalize">{{ form.status }}</span>
                  </div>
                  <p class="mb-1">Latest published version: {{ form.latestVersion || 'None' }}</p>
                  <p>Draft revision: {{ form.draftRevision ?? 'None' }}</p>
                  @if (form.draftRevision !== null) {
                    <a
                      class="btn btn-outline-primary"
                      [routerLink]="['/manage/forms', form.id, 'edit']"
                      >Edit draft</a
                    >
                  } @else if (form.status === 'published') {
                    <button
                      class="btn btn-outline-primary"
                      type="button"
                      (click)="startEditing(form.id)"
                    >
                      Start editing
                    </button>
                  }
                </div>
              </div>
            </article>
          }
        </div>
        @if (management.nextCursor(); as cursor) {
          <button
            class="btn btn-outline-primary mt-4"
            type="button"
            (click)="management.load(cursor)"
          >
            Next page
          </button>
        }
      }
    </main>`,
})
export class FormManagementPage implements OnInit {
  constructor(
    readonly management: FormManagementStore,
    private readonly api: FormManagementApiService,
    private readonly router: Router,
  ) {}
  ngOnInit(): void {
    this.management.load();
  }
  startEditing(formId: string): void {
    this.api
      .bootstrap(formId)
      .pipe(take(1))
      .subscribe({
        next: () => void this.router.navigate(['/manage/forms', formId, 'edit']),
        error: () => this.management.load(),
      });
  }
}
