// @vitest-environment happy-dom
//
// The app shell header and its account menu (SCP-027, US-A4 / EX-14).
//
// The point of these: before this component existed there was no way to sign
// out of a production build at all, and /account was URL-only. Both are
// asserted here so a layout refactor cannot quietly remove them again.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import type { MeUser } from '@widgetry/shared';
import AppHeader from './AppHeader.svelte';
import '@testing-library/jest-dom/vitest';

beforeAll(() => {
  // happy-dom does not implement the Web Animations API, and Zag's popover
  // calls element.animate() on open. Without this the assertions still pass
  // but vitest records an unhandled error and exits non-zero, which fails CI.
  // A no-op that returns the shape the caller touches is enough - nothing here
  // asserts on the animation itself.
  if (typeof Element.prototype.animate !== 'function') {
    Element.prototype.animate = () =>
      ({
        cancel() {},
        finish() {},
        addEventListener() {},
        removeEventListener() {},
        finished: Promise.resolve(),
      }) as unknown as Animation;
  }
});

afterEach(() => {
  cleanup();
});

// Typed as MeUser, not inferred: `image: null` would otherwise narrow to
// `null` and the avatar case below could not pass a URL.
const USER: MeUser = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  emailVerified: true,
  image: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function mount(over: Partial<MeUser> = {}, pathname = '/boards') {
  return render(AppHeader, { props: { user: { ...USER, ...over }, pathname } });
}

describe('AppHeader - navigation', () => {
  it('links the brand back to the board list', () => {
    mount();
    expect(screen.getByRole('link', { name: /widgetry home/i })).toHaveAttribute('href', '/boards');
  });

  it('shows the signed-in destinations', () => {
    mount();
    expect(screen.getByRole('link', { name: 'Boards' })).toHaveAttribute('href', '/boards');
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/faq');
  });

  it('marks the current section with aria-current, not colour alone', () => {
    // Design Principles §3.4: state reads through more than one channel.
    mount({}, '/boards/abc');
    expect(screen.getByRole('link', { name: 'Boards' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'FAQ' })).not.toHaveAttribute('aria-current');
  });
});

describe('AppHeader - account menu', () => {
  it('has a labelled trigger', () => {
    mount();
    expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
  });

  it('falls back to an initial when the user has no avatar image', () => {
    mount();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('uses the avatar image when Google supplied one (FR-1.3)', () => {
    mount({ image: 'https://lh3.example.com/a/ada' });
    const img = document.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://lh3.example.com/a/ada');
    // Decorative: the name sits beside it, so alt text would be read twice.
    expect(img).toHaveAttribute('alt', '');
  });

  it('opens to reveal account settings and sign out', async () => {
    mount();
    await fireEvent.click(screen.getByRole('button', { name: /account menu/i }));

    expect(screen.getByRole('link', { name: /account settings/i })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('signs out by POSTing to /sign-out, so a link or prefetch cannot end a session', async () => {
    mount();
    await fireEvent.click(screen.getByRole('button', { name: /account menu/i }));

    const form = screen.getByRole('button', { name: /sign out/i }).closest('form');
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute('method', 'POST');
    expect(form).toHaveAttribute('action', '/sign-out');
  });
});
