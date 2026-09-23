<script lang="ts">
  import { untrack } from 'svelte';
  import { Modal } from '@skeletonlabs/skeleton-svelte';
  import ConfigForm from './ConfigForm.svelte';
  import CustomWidgetForm from './CustomWidgetForm.svelte';
  import { MIN_SERVER_POLL_SECONDS, WIDGET_TYPE_DEFS, type WidgetDetail } from '@widgetry/shared';
  import type { CustomJsonConfig, WidgetType } from '@widgetry/shared';
  import { NEW_WIDGET_HEIGHT, NEW_WIDGET_WIDTH } from '$lib/widget-placement';
  import { configFieldErrors } from './api-field-errors';
  import type { CustomWidgetSubmission } from '$lib/widgets/custom/types';

  type WidgetTypeSummary = {
    id: string;
    displayName: string;
    category: 'monitoring' | 'informational' | 'custom';
    supportsHistory: boolean;
  };

  type Props = {
    open: boolean;
    boardId: string;
    /** Create mode: which type to configure. Ignored when `editWidgetId` is
     * set - edit mode derives the type from the widget it fetches. */
    widgetType: WidgetTypeSummary | null;
    /** US-C6: present to edit an existing widget's configuration instead of
     * creating a new one. The route owns clearing this back to null on close. */
    editWidgetId?: string | null;
    onOpenChange?: (open: boolean) => void;
    onCreated?: (widget: unknown) => void;
    /** US-C6: fired after a successful edit save, mirroring onCreated. */
    onUpdated?: (widget: unknown) => void;
    /**
     * Where the new widget goes. The API rejects a widget that overlaps another
     * (FR-3.3), so the board page passes the first free slot. Defaults to the
     * top-left corner for callers with no board to look at (the dev gallery).
     * Unused when editing - US-C6 is configuration only, not placement.
     */
    position?: { gridCol: number; gridRow: number };
  };

  let {
    open,
    boardId,
    widgetType,
    editWidgetId = null,
    onOpenChange,
    onCreated,
    onUpdated,
    position = { gridCol: 0, gridRow: 0 },
  }: Props = $props();

  let values = $state<Record<string, string>>({});
  let errors = $state<Record<string, string>>({});
  let status = $state<'idle' | 'submitting' | 'error'>('idle');
  /** #239: the custom_json config shape needs a dedicated form - the array
   * fields it needs (slots, headers) are not representable by ConfigForm's
   * generic scalar-field rendering. Every other type still goes through
   * ConfigForm exactly as before. */
  let customError = $state<string | null>(null);

  const isEditing = $derived(editWidgetId != null);

  // US-C6: the widget being edited, fetched full and unfiltered (WidgetDetail,
  // not the board payload's display-allowlisted config - see that schema's
  // doc comment) the moment editWidgetId is set. `detailError` covers the
  // fetch itself failing; a 404 (deleted between menu-click and modal-open)
  // reads the same as any other load failure here rather than a special case.
  let detail = $state<WidgetDetail | null>(null);
  let detailError = $state<string | null>(null);
  /** True from the moment editWidgetId is set until either `detail` or
   * `detailError` lands - covers both "not started yet" and "in flight"
   * without a third flag to keep in sync with those two. */
  const awaitingDetail = $derived(isEditing && detail === null && detailError === null);
  /**
   * Bumped every time a fetch starts. Two jobs:
   *  1. Lets a response tell whether it is still the one anyone asked for -
   *     without it, editing widget A then quickly re-opening for widget B
   *     could let A's slower response land after B's and overwrite it.
   *  2. Gives `{#key}` below something that changes on EVERY fresh edit
   *     open, including re-opening the SAME widget - `editWidgetId` alone
   *     does not change value in that case, so an effect or a `{#key}`
   *     keyed on it alone would miss the re-fetch entirely and leave
   *     CustomWidgetForm showing whatever it last saw, not what was just
   *     saved. This is what actually caught that bug in testing.
   */
  let editSession = $state(0);

  $effect(() => {
    // Reading `open` here (not just `editWidgetId`) is load-bearing: closing
    // and re-opening the SAME widget for a second edit does not change
    // `editWidgetId`'s value, so an effect that only depended on that id
    // would never re-run and the form would keep showing the FIRST edit's
    // values even after a save changed them on the server.
    if (!open || editWidgetId == null) {
      detail = null;
      detailError = null;
      return;
    }
    detail = null;
    detailError = null;
    // untrack: a plain `editSession += 1` both reads and writes editSession,
    // which would make this effect depend on the very state it mutates -
    // every write re-triggers the effect that just wrote it, forever
    // (effect_update_depth_exceeded, caught live while testing this in the
    // browser). Reading the current value untracked breaks that self-cycle;
    // the write itself is still a normal, trackable `$state` write, which is
    // exactly what the `{#key}` below needs to see.
    const thisSession = untrack(() => editSession) + 1;
    editSession = thisSession;
    fetch(`/v1/widgets/${editWidgetId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('load failed');
        const body = (await res.json()) as WidgetDetail;
        if (thisSession !== editSession) return; // superseded by a later open
        detail = body;
      })
      .catch(() => {
        if (thisSession !== editSession) return;
        detailError = 'This widget could not be loaded.';
      });
  });

  /** The type being configured, from whichever mode is active. Edit mode
   * cannot take `widgetType` as a prop the way create mode does - the whole
   * point of editing by id is that the caller does not have to already know
   * the type - so it is derived from the fetched widget's own `widgetType`
   * through the same registry create mode reads from. */
  const effectiveType = $derived<WidgetTypeSummary | null>(
    isEditing
      ? detail
        ? {
            id: detail.widgetType,
            displayName: WIDGET_TYPE_DEFS[detail.widgetType].displayName,
            category: WIDGET_TYPE_DEFS[detail.widgetType].category,
            supportsHistory: WIDGET_TYPE_DEFS[detail.widgetType].supportsHistory,
          }
        : null
      : widgetType,
  );

  const def = $derived(effectiveType ? WIDGET_TYPE_DEFS[effectiveType.id as WidgetType] : null);
  const isCustomJson = $derived(effectiveType?.id === 'custom_json');

  $effect(() => {
    // Create mode: reset to a blank form whenever a new type is selected.
    if (!isEditing && widgetType) {
      values = {};
      errors = {};
      status = 'idle';
      customError = null;
    }
  });

  $effect(() => {
    // Edit mode: seed the generic form's values from the fetched config the
    // moment it arrives. ConfigForm only knows string values (Eng §7.4), so
    // this coerces the same way `submit` below coerces back on the way out.
    if (isEditing && detail) {
      values = Object.fromEntries(
        Object.entries(detail.config).map(([key, value]) => [
          key,
          value == null ? '' : String(value),
        ]),
      );
      errors = {};
      status = 'idle';
      customError = null;
    }
  });

  /** Custom JSON's own initial state for edit mode - see CustomWidgetForm's
   * `EditInitial`. Undefined (not passed) in create mode, and while a fetch
   * is still in flight, so the form seeds blank rather than half-populated. */
  const customInitial = $derived(
    isEditing && detail && detail.widgetType === 'custom_json'
      ? {
          // Cast, not a parse: the API already validated this shape when it
          // was written (parseWidgetConfig, on both create and every PATCH
          // since), and re-validating a value this form already trusts would
          // just be a second copy of that check to keep in sync.
          config: detail.config as unknown as CustomJsonConfig,
          refreshIntervalSeconds: detail.refreshIntervalSeconds ?? MIN_SERVER_POLL_SECONDS,
          hasCredential: detail.hasCredential,
        }
      : undefined,
  );

  function close() {
    onOpenChange?.(false);
  }

  function finishSaved(widget: unknown) {
    if (isEditing) onUpdated?.(widget);
    else onCreated?.(widget);
  }

  async function submit() {
    if (!effectiveType || !def) return;
    status = 'submitting';
    errors = {};

    // Coerce string form values into the shape the API's config schema
    // expects (numbers/booleans back to real types) before sending.
    const config: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(values)) {
      config[key] = raw;
    }

    try {
      const res = isEditing
        ? await fetch(`/v1/widgets/${editWidgetId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config }),
          })
        : await fetch(`/v1/boards/${boardId}/widgets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              widgetType: effectiveType.id,
              config,
              gridCol: position.gridCol,
              gridRow: position.gridRow,
              gridWidth: NEW_WIDGET_WIDTH,
              gridHeight: NEW_WIDGET_HEIGHT,
            }),
          });

      const body = await res.json();

      if (!res.ok) {
        if (body.error?.code === 'validation_failed') {
          // The API sends details.issues as [{ path: 'config.url', message }].
          // This used to read details.fieldErrors, which the API never sends, so
          // every field error fell through to the generic message.
          errors = configFieldErrors(body);
        }
        status = 'error';
        return;
      }

      finishSaved(body);
      close();
    } catch {
      status = 'error';
    }
  }

  /**
   * #239/US-C1/US-C5/US-C6: custom_json's own multi-step submit - create or
   * update the widget with its config and refresh interval, then reconcile
   * the credential separately (Eng §10.2: the widget must exist first, its id
   * is the credential row's key - true on create, and still the shape edit
   * reuses since PATCH never touches api_credentials itself). A credential
   * write failure does NOT roll back the widget save - it already exists and
   * is visible on the board either way - so `finishSaved` still fires; the
   * user's fix is re-entering the key.
   */
  async function submitCustom(submission: CustomWidgetSubmission) {
    status = 'submitting';
    customError = null;

    let saved: { id: string } | undefined;
    try {
      const res = isEditing
        ? await fetch(`/v1/widgets/${editWidgetId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              config: submission.config,
              refreshIntervalSeconds: submission.refreshIntervalSeconds,
            }),
          })
        : await fetch(`/v1/boards/${boardId}/widgets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              widgetType: submission.widgetType,
              config: submission.config,
              refreshIntervalSeconds: submission.refreshIntervalSeconds,
              gridCol: position.gridCol,
              gridRow: position.gridRow,
              gridWidth: Math.max(NEW_WIDGET_WIDTH, submission.minWidth),
              gridHeight: Math.max(NEW_WIDGET_HEIGHT, submission.minHeight),
            }),
          });

      const body = await res.json();

      if (!res.ok) {
        customError = typeof body.error?.message === 'string' ? body.error.message : null;
        status = 'error';
        return;
      }
      saved = body;
    } catch {
      customError = 'Something went wrong saving this widget.';
      status = 'error';
      return;
    }

    if (submission.secret) {
      try {
        const credRes = await fetch(`/v1/widgets/${saved!.id}/credential`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: submission.secret }),
        });
        if (!credRes.ok) {
          finishSaved(saved);
          customError =
            'The widget was saved, but its API key could not be saved. Try entering it again.';
          status = 'error';
          return;
        }
      } catch {
        finishSaved(saved);
        customError =
          'The widget was saved, but its API key could not be saved. Try entering it again.';
        status = 'error';
        return;
      }
    } else if (isEditing && detail?.hasCredential && submission.config.apiKey === undefined) {
      // US-C6: auth was turned off (no secret entered, and the new config no
      // longer names a placement) on a widget that had a credential saved.
      // Leaving the row behind would be inert (nothing reads it once config
      // has no apiKey) but stale, and the user asked for auth to be off, not
      // just for the placement to stop being shown - so clean it up. Best
      // effort: the widget save above already succeeded, and a failure here
      // is not worth blocking on or reporting as this save's error.
      try {
        await fetch(`/v1/widgets/${saved!.id}/credential`, { method: 'DELETE' });
      } catch {
        // See above - not fatal to this save.
      }
    }

    finishSaved(saved);
    close();
  }
</script>

<Modal
  {open}
  onOpenChange={(state) => onOpenChange?.(state.open)}
  contentBase="w-full {isCustomJson
    ? 'max-w-3xl'
    : 'max-w-lg'} rounded-2xl border border-surface-200-800 bg-surface-50-950 shadow-xl"
>
  {#snippet content()}
    {#if awaitingDetail}
      <div class="flex flex-col items-center justify-center gap-2 p-10">
        <p class="text-sm text-surface-600-400">Loading widget…</p>
      </div>
    {:else if isEditing && detailError}
      <div class="flex flex-col gap-4 p-5">
        <p class="text-sm text-error-500">{detailError}</p>
        <button
          type="button"
          onclick={close}
          class="self-end rounded-lg border border-surface-200-800 px-4 py-2 text-sm font-medium text-surface-950-50 hover:bg-surface-100-900"
        >
          Close
        </button>
      </div>
    {:else if isCustomJson}
      {#key isEditing ? `edit-${editSession}` : 'create'}
        <CustomWidgetForm
          onClose={close}
          onSubmit={submitCustom}
          submitting={status === 'submitting'}
          submitError={customError}
          initial={customInitial}
        />
      {/key}
    {:else}
      <div class="flex items-center justify-between border-b border-surface-200-800 p-5">
        <div>
          <h2 class="text-lg font-semibold text-surface-950-50">
            {isEditing ? 'Edit' : 'Configure'}
            {effectiveType?.displayName}
          </h2>
          <p class="text-xs text-surface-600-400">Point it at an endpoint and save.</p>
        </div>
        <button
          type="button"
          onclick={close}
          aria-label="Close"
          class="rounded-lg p-1.5 text-surface-600-400 hover:bg-surface-100-900"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div class="max-h-[60vh] overflow-y-auto p-5">
        {#if def}
          <ConfigForm schema={def.configSchema} bind:values {errors} />
        {/if}
        {#if status === 'error' && Object.keys(errors).length === 0}
          <p class="mt-3 text-sm text-error-500">Something went wrong saving this widget.</p>
        {/if}
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-surface-200-800 p-5">
        <button
          type="button"
          onclick={close}
          class="rounded-lg border border-surface-200-800 px-4 py-2 text-sm font-medium text-surface-950-50 hover:bg-surface-100-900"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={submit}
          disabled={status === 'submitting'}
          class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {status === 'submitting' ? 'Saving…' : isEditing ? 'Save changes' : 'Add widget'}
        </button>
      </div>
    {/if}
  {/snippet}
</Modal>
