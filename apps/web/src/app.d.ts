// See https://svelte.dev/docs/kit/types#app.d.ts for the reference on these interfaces.
import type { SessionUser } from '@widgetry/shared';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      /**
       * Resolved once per request by the session hook in hooks.server.ts, from
       * `GET /v1/auth/get-session`. Null when signed out - the auth guard means
       * a protected route never observes that state.
       */
      user: SessionUser | null;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
