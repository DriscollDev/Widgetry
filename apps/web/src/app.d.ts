// See https://svelte.dev/docs/kit/types#app.d.ts for the reference on these interfaces.
import type { MeUser } from '@widgetry/shared';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      /**
       * Resolved once per request by the session hook in hooks.server.ts, from
       * `GET /v1/me`. Null when signed out - the auth guard means a protected
       * route never observes that state.
       */
      user: MeUser | null;
      /**
       * Why `user` is what it is. `unavailable` means the api could not be
       * asked, which is NOT the same as signed out - see the guard.
       */
      sessionStatus: 'authenticated' | 'anonymous' | 'unavailable';
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
