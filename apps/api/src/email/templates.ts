// apps/api/src/email/templates.ts
//
// The two auth emails required by FR-1.7 (verification) and FR-1.8 (password
// reset). Both are rendered here rather than in auth.ts so the policy file
// stays about policy, and so the copy is unit-testable without constructing a
// Better-Auth instance.
//
// Deliberately plain HTML: table-free, inline styles only, no external CSS,
// no images, no web fonts. Mail clients strip <style> blocks and remote assets
// unpredictably, and the only thing that must survive that is the link. Every
// message ships a text/plain alternative for the same reason - and because a
// text-only client is the accessibility floor (Feature Spec §6.5).

import type { OutboundEmail } from './send.js';

const PRODUCT_NAME = 'Widgetry';

/**
 * The name comes from user input at sign-up, so it is untrusted and must be
 * escaped before it reaches the HTML part. The URL is ours, but escaping it
 * costs nothing and stops a stray `&` from breaking the href.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "in 1 hour" / "in 45 minutes" - so the copy can never drift from the TTL. */
function humanizeMinutes(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/** Greeting only when we actually have a name; Better-Auth allows an empty one. */
function greeting(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? `Hi ${trimmed},` : 'Hi,';
}

function layout(bodyHtml: string): string {
  return [
    '<!doctype html>',
    '<html lang="en"><body style="margin:0;padding:24px;background:#f4f4f5;',
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;",
    'color:#18181b;line-height:1.5;">',
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">',
    `<h1 style="margin:0 0 24px;font-size:20px;font-weight:600;">${PRODUCT_NAME}</h1>`,
    bodyHtml,
    '</div></body></html>',
  ].join('');
}

function button(url: string, label: string): string {
  return (
    `<p style="margin:0 0 24px;"><a href="${escapeHtml(url)}" ` +
    'style="display:inline-block;padding:12px 20px;background:#18181b;color:#ffffff;' +
    `text-decoration:none;border-radius:6px;font-weight:600;">${label}</a></p>` +
    '<p style="margin:0 0 24px;font-size:13px;color:#52525b;">' +
    `If the button does not work, paste this link into your browser:<br>${escapeHtml(url)}</p>`
  );
}

export interface AuthEmailParams {
  to: string;
  name?: string | null;
  url: string;
  /** Token lifetime, so the copy always matches the configured TTL. */
  expiresInMinutes: number;
}

/** FR-1.7: sent on sign-up, and on any explicit resend request. */
export function verificationEmail({
  to,
  name,
  url,
  expiresInMinutes,
}: AuthEmailParams): OutboundEmail {
  const validFor = humanizeMinutes(expiresInMinutes);

  return {
    to,
    subject: `Verify your ${PRODUCT_NAME} email address`,
    html: layout(
      `<p style="margin:0 0 16px;">${escapeHtml(greeting(name))}</p>` +
        `<p style="margin:0 0 24px;">Confirm this address to finish setting up your ${PRODUCT_NAME} ` +
        'account. You can keep using your dashboards in the meantime - verifying just makes ' +
        'account recovery possible.</p>' +
        button(url, 'Verify email address') +
        `<p style="margin:0;font-size:13px;color:#52525b;">This link expires in ${validFor}. ` +
        'If you did not create an account, you can ignore this email.</p>',
    ),
    text: [
      greeting(name),
      '',
      `Confirm this address to finish setting up your ${PRODUCT_NAME} account. You can keep`,
      'using your dashboards in the meantime - verifying just makes account recovery possible.',
      '',
      url,
      '',
      `This link expires in ${validFor}. If you did not create an account, you can ignore this email.`,
      '',
      `- ${PRODUCT_NAME}`,
    ].join('\n'),
  };
}

/**
 * FR-1.8: sent only to accounts that have already verified their address
 * (FR-1.7 makes verification a precondition for reset - the gate itself lives
 * in auth.ts, where the flow can be stopped before a token is even used).
 */
export function passwordResetEmail({
  to,
  name,
  url,
  expiresInMinutes,
}: AuthEmailParams): OutboundEmail {
  const validFor = humanizeMinutes(expiresInMinutes);

  return {
    to,
    subject: `Reset your ${PRODUCT_NAME} password`,
    html: layout(
      `<p style="margin:0 0 16px;">${escapeHtml(greeting(name))}</p>` +
        '<p style="margin:0 0 24px;">Use the link below to choose a new password. It works once, ' +
        'and only until it expires.</p>' +
        button(url, 'Choose a new password') +
        `<p style="margin:0;font-size:13px;color:#52525b;">This link expires in ${validFor} and can ` +
        'only be used once. If you did not ask to reset your password, you can ignore this email - ' +
        'your current password still works.</p>',
    ),
    text: [
      greeting(name),
      '',
      'Use the link below to choose a new password. It works once, and only until it expires.',
      '',
      url,
      '',
      `This link expires in ${validFor} and can only be used once. If you did not ask to reset`,
      'your password, you can ignore this email - your current password still works.',
      '',
      `- ${PRODUCT_NAME}`,
    ].join('\n'),
  };
}
