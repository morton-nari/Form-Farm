import { Component } from '@angular/core';

import { FormViewerPage } from './features/form-viewer/pages/form-viewer-page/form-viewer-page';

@Component({
  selector: 'app-root',
  imports: [FormViewerPage],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
