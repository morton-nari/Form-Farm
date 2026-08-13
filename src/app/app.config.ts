import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors, withNoXsrfProtection } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { formFarmXsrfInterceptor } from './core/api/xsrf.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withNoXsrfProtection(), withInterceptors([formFarmXsrfInterceptor])),
    provideRouter(routes),
  ],
};
