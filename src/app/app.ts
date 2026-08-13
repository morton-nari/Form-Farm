import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthenticationStore } from './core/auth/authentication.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  constructor(readonly authentication: AuthenticationStore) {}
}
