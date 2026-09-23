// Shared between the root layout (which reads the cookie server-side) and
// the notice component (which sets it on dismiss). One constant so the two
// halves cannot drift apart.

/**
 * FR-1.7 / Screen Inventory §6.2: dismissal lasts for the session and the
 * notice returns next session. Permanent dismissal is deliberately not
 * offered, which is why this is written as a SESSION cookie - no `Max-Age`
 * and no `Expires`, so the browser drops it when it closes.
 */
export const VERIFY_NOTICE_DISMISS_COOKIE = 'widgetry_verify_notice_dismissed';

/** Not HttpOnly on purpose: the dismiss button is client-side, and this is a
 * UI preference rather than anything security-bearing. */
export function dismissCookieValue(): string {
  return `${VERIFY_NOTICE_DISMISS_COOKIE}=1; Path=/; SameSite=Lax`;
}
