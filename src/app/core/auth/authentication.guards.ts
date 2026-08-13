import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthenticationStore } from './authentication.store';

export const authenticatedGuard: CanActivateFn = async (_route, state) => {
  const store = inject(AuthenticationStore);
  const router = inject(Router);
  return (await store.bootstrap()) === 'authenticated'
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const anonymousGuard: CanActivateFn = async () => {
  const store = inject(AuthenticationStore);
  const router = inject(Router);
  return (await store.bootstrap()) === 'authenticated' ? router.createUrlTree(['/forms']) : true;
};
