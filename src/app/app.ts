import { Component } from '@angular/core';

import { QuoteJourneyPage } from './features/quote-journey/pages/quote-journey-page/quote-journey-page';

@Component({
  selector: 'app-root',
  imports: [QuoteJourneyPage],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
