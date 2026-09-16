// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import VerifyEmailFooter from './VerifyEmailFooter.svelte';
import { VERIFY_NOTICE_DISMISS_COOKIE } from './verify-notice';
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
  // happy-dom keeps document.cookie between tests; expiring it stops a
  // dismissal in one case leaking into the next.
  document.cookie = `${VERIFY_NOTICE_DISMISS_COOKIE}=; Path=/; Max-Age=0`;
});

describe('VerifyEmailFooter', () => {
  it('shows the prompt and the address the link went to', () => {
    render(VerifyEmailFooter, { props: { email: 'adrian@example.com' } });

    expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    expect(screen.getByText('adrian@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend email/i })).toBeInTheDocument();
  });

  it('renders nothing when already dismissed this session', () => {
    render(VerifyEmailFooter, { props: { email: 'adrian@example.com', dismissed: true } });

    expect(screen.queryByText(/verify your email/i)).not.toBeInTheDocument();
  });

  it('hides itself and records a session cookie when dismissed', async () => {
    render(VerifyEmailFooter, { props: { email: 'adrian@example.com' } });

    await fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByText(/verify your email/i)).not.toBeInTheDocument();
    expect(document.cookie).toContain(`${VERIFY_NOTICE_DISMISS_COOKIE}=1`);
  });

  it('posts the resend form to the action route so it works without JS', () => {
    const { container } = render(VerifyEmailFooter, {
      props: { email: 'adrian@example.com' },
    });

    const form = container.querySelector('form');
    expect(form).toHaveAttribute('method', 'post');
    expect(form).toHaveAttribute('action', '/resend-verification');
  });
});
