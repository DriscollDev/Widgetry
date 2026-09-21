// Runs on every navigation. The session was already resolved by the hook in
// hooks.server.ts, so this is a pass-through, not a second round trip.
//
// `user` is what the app shell needs for the account menu and for the
// unverified-email banner (EX-16 - `user.emailVerified` is the flag it keys
// off). Only the fields on `SessionUser` cross to the client.

import { VERIFY_NOTICE_DISMISS_COOKIE } from '$lib/components/verify-notice';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, cookies }) => {
  return {
    user: locals.user,
    // Read server-side so the notice can be rendered in the SSR output. A
    // client-only check would leave it absent from the initial HTML, which
    // would hide it entirely from a no-JS client - and its resend control is
    // specifically built to work without JS.
    verifyNoticeDismissed: cookies.get(VERIFY_NOTICE_DISMISS_COOKIE) === '1',
  };
};
