<script lang="ts">
  // Test-only stand-in for CustomWidgetForm, used by
  // WidgetConfigModal.credential.test.ts and WidgetConfigModal.edit.test.ts to
  // drive WidgetConfigModal's submitCustom() with hardcoded submissions -
  // bypassing the real form's <select> auth-type UI, which happy-dom's
  // Svelte 5 bind:value support cannot drive (see WidgetConfigModal.test.ts).
  // Not part of the app bundle: only ever imported via vi.mock.
  import type { CustomJsonConfig } from '@widgetry/shared';
  import type { CustomWidgetSubmission } from '$lib/widgets/custom/types';

  type EditInitial = {
    config: CustomJsonConfig;
    refreshIntervalSeconds: number;
    hasCredential: boolean;
  };

  type Props = {
    onClose: () => void;
    onSubmit?: (submission: CustomWidgetSubmission) => void;
    submitting?: boolean;
    submitError?: string | null;
    initial?: EditInitial;
  };

  let { onClose, onSubmit, submitting = false, submitError = null, initial }: Props = $props();

  const BASE_CONFIG: CustomJsonConfig = {
    url: 'https://api.example.test/status',
    method: 'GET',
    headers: [],
    title: 'CPU',
    layoutId: 'single',
    accent: 'primary',
    slots: [{ primitive: 'number', label: 'CPU load', jsonPath: 'data.cpu' }],
    apiKey: { in: 'header', name: 'X-Api-Key' },
  };

  export const STUB_SUBMISSION: CustomWidgetSubmission = {
    widgetType: 'custom_json',
    minWidth: 1,
    minHeight: 1,
    config: BASE_CONFIG,
    refreshIntervalSeconds: 3600,
    secret: 'sk_test_123',
  };

  /** A new secret entered - PUT should fire. */
  function submitWithNewSecret() {
    onSubmit?.({ ...STUB_SUBMISSION, config: initial?.config ?? BASE_CONFIG });
  }

  /** Blank secret, auth placement unchanged from `initial` - no credential
   * call at all; the existing one (if any) stays valid untouched. */
  function submitKeepingAuth() {
    onSubmit?.({ ...STUB_SUBMISSION, config: initial?.config ?? BASE_CONFIG, secret: null });
  }

  /** Blank secret, auth turned off (no apiKey on the new config) - DELETE
   * should fire only if `initial.hasCredential` was true. */
  function submitClearingAuth() {
    const { apiKey: _apiKey, ...withoutAuth } = initial?.config ?? BASE_CONFIG;
    onSubmit?.({ ...STUB_SUBMISSION, config: withoutAuth, secret: null });
  }
</script>

<button type="button" onclick={submitWithNewSecret}>stub-submit</button>
<button type="button" onclick={submitKeepingAuth}>stub-submit-keep-auth</button>
<button type="button" onclick={submitClearingAuth}>stub-submit-clear-auth</button>
<button type="button" onclick={onClose}>stub-close</button>
{#if submitting}<p>stub-submitting</p>{/if}
{#if submitError}<p>{submitError}</p>{/if}
{#if initial}<p>stub-initial-url:{initial.config.url}</p>{/if}
