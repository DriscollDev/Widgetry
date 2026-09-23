// packages/db/src/seed-auth-rows.ts
//
// The `user` + `account` pair Better-Auth expects for an email+password
// account, built as plain data so the shape is unit tested without a database.
//
// ----------------------------------------------------------------------------
// WHY THE SEED WRITES THESE ROWS INSTEAD OF CALLING sign-up-email.
//
// Going through the api works, but it drags three things along that a demo
// fixture should not need:
//
//   1. The api has to be RUNNING. In production it is also not publicly
//      exposed (Eng §2.3), so seeding prod from a laptop has to be routed
//      through the web service's /v1 proxy.
//   2. Sign-up sends a verification email through Resend. The demo address
//      does not receive mail, so that is a hard bounce against the sending
//      domain every time the fixture is rebuilt.
//   3. The account lands UNVERIFIED, which puts EX-16's "verify your email"
//      banner across the demo until something clears it.
//
// Writing the rows directly removes all three: no running service, no outbound
// mail, and `emailVerified` is simply true from the start.
//
// THE ONE THING THAT MUST NOT DRIFT is the password hash. Better-Auth verifies
// `account.password` with the verifier the api configures, so a hash produced
// with different parameters would leave a demo account nobody can sign in to.
// That is why hashPassword lives in this package (see ./password.ts) and is
// imported by BOTH the api and this seed rather than existing twice. Argon2's
// parameters are embedded in the encoded hash, so verification reads them back
// out and a matching hash verifies regardless of who wrote it.
//
// This is a fixture account in our own database, not a way around an auth
// control: the same password rules apply to it, and it is the only account
// either seed script can touch.
// ----------------------------------------------------------------------------

/** Better-Auth's provider id for email+password accounts. */
export const CREDENTIAL_PROVIDER_ID = 'credential';

export type DemoUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DemoAccountRow = {
  id: string;
  accountId: string;
  providerId: string;
  userId: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Build the pair.
 *
 * `accountId` is the USER's id, which is what Better-Auth stores for the
 * credential provider - for an OAuth provider it would be the provider's own
 * subject id, but for email+password the account is the user.
 *
 * Both timestamps are set explicitly: `account.updated_at` is NOT NULL with no
 * database default (see schema/auth.ts), so leaving it out is a constraint
 * violation rather than a defaulted row.
 *
 * @param ids injectable so the test does not depend on randomness
 */
export function buildDemoAuthRows(
  demo: { email: string; name: string },
  passwordHash: string,
  now: Date = new Date(),
  ids: { userId: string; accountId: string } = {
    userId: crypto.randomUUID(),
    accountId: crypto.randomUUID(),
  },
): { user: DemoUserRow; account: DemoAccountRow } {
  return {
    user: {
      id: ids.userId,
      name: demo.name,
      email: demo.email,
      // The whole point: no verification round trip to wait on. The address is
      // ours and receives no mail, so there is nothing for it to confirm.
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
    account: {
      id: ids.accountId,
      accountId: ids.userId,
      providerId: CREDENTIAL_PROVIDER_ID,
      userId: ids.userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    },
  };
}
