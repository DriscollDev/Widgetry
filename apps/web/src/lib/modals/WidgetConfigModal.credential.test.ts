// @vitest-environment happy-dom
//
// Covers submitCustom()'s two-step create-then-PUT-credential sequencing
// (#239, US-C1/US-C5, Eng §10.2) via a stubbed CustomWidgetForm rather than
// the real one. Driving the real form's auth-type <select> through happy-dom
// does not reach Svelte 5's bind:value in this test environment (see the
// comment on fillMinimalForm in WidgetConfigModal.test.ts) - that is a test
// environment gap, not a production bug, verified separately in a real
// browser. This file isolates WidgetConfigModal's own wiring logic from that
// gap by swapping in CustomWidgetFormStub.test-helper.svelte, which submits a
// hardcoded submission (including a secret) on a button click.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

vi.mock('./CustomWidgetForm.svelte', async () => {
  const stub = await import('./CustomWidgetFormStub.test-helper.svelte');
  return { default: stub.default };
});

const { default: WidgetConfigModal } = await import('./WidgetConfigModal.svelte');

const customJson = {
  id: 'custom_json',
  displayName: 'Custom JSON',
  category: 'custom' as const,
  supportsHistory: true,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderCustomModal() {
  const onCreated = vi.fn();
  const onOpenChange = vi.fn();
  render(WidgetConfigModal, {
    props: { open: true, boardId: 'board-1', widgetType: customJson, onCreated, onOpenChange },
  });
  return { onCreated, onOpenChange };
}

describe('WidgetConfigModal custom_json credential sequencing (#239, US-C1/US-C5, Eng §10.2)', () => {
  it('PUTs the secret to the credential endpoint after the widget exists', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (init.method === 'POST') {
          return new Response(JSON.stringify({ id: 'w-custom' }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({ widgetId: 'w-custom', hasCredential: true, savedAt: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const { onCreated, onOpenChange } = renderCustomModal();
    await fireEvent.click(screen.getByText('stub-submit'));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]!.url).toBe('/v1/boards/board-1/widgets');
    expect(calls[1]!.url).toBe('/v1/widgets/w-custom/credential');
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ apiKey: 'sk_test_123' });

    const widgetBody = JSON.parse(String(calls[0]!.init.body));
    expect(widgetBody.config.apiKey).toEqual({ in: 'header', name: 'X-Api-Key' });
    // The secret itself must never land in the config jsonb.
    expect(JSON.stringify(widgetBody.config)).not.toContain('sk_test_123');

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onCreated).toHaveBeenCalledWith({ id: 'w-custom' });
  });

  it('reports the widget as created even when the follow-up credential PUT fails', async () => {
    // The widget already exists and is visible on the board at this point -
    // rolling back onCreated would hide a real row from a page that already
    // has no way to know it should. See the comment on submitCustom.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        if (init.method === 'POST') {
          return new Response(JSON.stringify({ id: 'w-custom' }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 500 });
      }),
    );

    const { onCreated, onOpenChange } = renderCustomModal();
    await fireEvent.click(screen.getByText('stub-submit'));

    expect(
      await screen.findByText(
        'The widget was saved, but its API key could not be saved. Try entering it again.',
      ),
    ).toBeTruthy();
    expect(onCreated).toHaveBeenCalledWith({ id: 'w-custom' });
    // Unlike the success path, the modal stays open so the error is visible.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
