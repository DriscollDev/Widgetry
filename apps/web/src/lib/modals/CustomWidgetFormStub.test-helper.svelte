<script lang="ts">
  // Test-only stand-in for CustomWidgetForm, used by
  // WidgetConfigModal.credential.test.ts to drive WidgetConfigModal's
  // submitCustom() with a hardcoded submission (including a secret) -
  // bypassing the real form's <select> auth-type UI, which happy-dom's
  // Svelte 5 bind:value support cannot drive (see WidgetConfigModal.test.ts).
  // Not part of the app bundle: only ever imported via vi.mock.
  import type { CustomWidgetSubmission } from '$lib/widgets/custom/types';

  type Props = {
    onClose: () => void;
    onSubmit?: (submission: CustomWidgetSubmission) => void;
    submitting?: boolean;
    submitError?: string | null;
  };

  let { onClose, onSubmit, submitting = false, submitError = null }: Props = $props();

  export const STUB_SUBMISSION: CustomWidgetSubmission = {
    widgetType: 'custom_json',
    minWidth: 1,
    minHeight: 1,
    config: {
      url: 'https://api.example.test/status',
      method: 'GET',
      headers: [],
      title: 'CPU',
      layoutId: 'single',
      accent: 'primary',
      slots: [{ primitive: 'number', label: 'CPU load', jsonPath: 'data.cpu' }],
      apiKey: { in: 'header', name: 'X-Api-Key' },
    },
    refreshIntervalSeconds: 3600,
    secret: 'sk_test_123',
  };
</script>

<button type="button" onclick={() => onSubmit?.(STUB_SUBMISSION)}>stub-submit</button>
<button type="button" onclick={onClose}>stub-close</button>
{#if submitting}<p>stub-submitting</p>{/if}
{#if submitError}<p>{submitError}</p>{/if}
