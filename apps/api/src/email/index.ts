// Public surface of the api's transactional-email module (EX-15).
//
// Rendering (templates.ts) is kept separate from delivery (send.ts) so tests
// can assert on a rendered message without a provider, and so a provider swap
// touches one file. Callers - today only auth.ts - compose the two.

export {
  emailLogger,
  sendEmail,
  setEmailLogger,
  type EmailLogger,
  type OutboundEmail,
} from './send.js';
export { passwordResetEmail, verificationEmail, type AuthEmailParams } from './templates.js';
