// Runs on every navigation. The session was already resolved by the hook in
// hooks.server.ts, so this is a pass-through, not a second round trip.
//
// `user` is what the app shell needs for the account menu and for the
// unverified-email banner (EX-16 - `user.emailVerified` is the flag it keys
// off). Only the fields on `SessionUser` cross to the client.

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
  return { user: locals.user };
};
