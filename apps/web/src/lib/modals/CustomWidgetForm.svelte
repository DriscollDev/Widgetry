<script lang="ts">
  // The custom widget's whole form, on ONE page: the source, the values bound
  // out of it, and the two presentation fields (title, accent) beside the live
  // preview they change. This is the whole modal CONTENT (header/body/footer)
  // minus the Modal wrapper, so it can be dropped into the template picker as
  // its "Custom" branch without duplicating any of it.
  //
  // It used to be paged - build, then Next, then title and accent. The second
  // page held two controls, could only report problems by telling the user to
  // go back, and put the accent swatches on a different screen from the preview
  // that shows what they do. Title now sits above the fields it names and the
  // swatches sit under the preview, so both change something visible as they
  // are set.
  //
  // The "Field type" select is a placeholder for binding-by-click:
  // once the modal can fetch the endpoint and show its JSON tree, the type
  // is read from the chosen field and this control disappears.

  import {
    arrangementFor,
    MAX_SLOTS,
    MIN_SERVER_POLL_SECONDS,
    primitivesForClass,
    type CustomJsonConfig,
  } from '@widgetry/shared';
  import CustomWidget from '../widgets/custom/CustomWidget.svelte';
  import { previewDataFor } from './custom-widget-preview';
  import { ACCENT_COLORS, type AccentColor } from '../widgets/accent';
  import {
    DATA_KINDS,
    DATA_KIND_LABELS,
    kindForSlot,
    slotWidthFor,
    SLOT_WIDTHS,
    SLOT_WIDTH_LABELS,
    PRIMITIVE_ACCEPTS,
    PRIMITIVE_LABELS,
    AUTH_TYPES,
    isValidEndpoint,
    type WidgetAuthType,
    type CustomWidgetConfig,
    type CustomWidgetSubmission,
    type DataKind,
    type SlotConfig,
    type SlotPrimitive,
    type SlotWidth,
  } from '../widgets/custom/types';

  /** One row of the general headers list (US-C1). Separate from the auth
   * section below - this is arbitrary caller headers, not the credential. */
  type HeaderRow = { name: string; value: string };

  /**
   * US-C6: what the caller already knows about the widget being edited. Not
   * the widget's full API shape - just the two things this form cannot derive
   * on its own: the stored config to seed every field from, and whether a
   * credential already exists (the secret itself is NEVER here - FR-6.2, and
   * this form never receives it from anywhere).
   */
  type EditInitial = {
    config: CustomJsonConfig;
    refreshIntervalSeconds: number;
    hasCredential: boolean;
  };

  type Props = {
    onClose: () => void;
    onSubmit?: (submission: CustomWidgetSubmission) => void;
    /** Supplied when this is reached from the template picker - the footer's
     * back button then returns to the template list instead of vanishing. */
    onBack?: () => void;
    /** The caller's in-flight state for the async work `onSubmit` kicks off
     * (the widget POST, then a credential PUT if there's a secret) - this
     * form has no fetch of its own, so it cannot know that on its own. */
    submitting?: boolean;
    /** Surfaced from the caller's own POST/PUT, e.g. a rejected overlap or a
     * credential save failure after the widget itself was created. */
    submitError?: string | null;
    /** US-C6: present when editing an existing widget rather than creating
     * one. Every field seeds from it, including the field type each slot was
     * built with, and the submit button reads "Save changes". */
    initial?: EditInitial;
  };

  let {
    onClose,
    onSubmit,
    onBack,
    submitting = false,
    submitError = null,
    initial,
  }: Props = $props();

  const isEditing = initial !== undefined;
  const hasCredential = initial?.hasCredential ?? false;

  /**
   * The real `CustomJsonApiKeyPlacement` reversed back into this form's
   * auth-section fields. 'bearer' is UI sugar with no schema counterpart
   * (see `apiKeyPlacement` below) - a header placement literally named
   * `Authorization` reads back as 'bearer' rather than as a custom header,
   * matching the only way this form itself ever produces that placement.
   */
  function authFieldsFor(apiKey: CustomJsonConfig['apiKey']): {
    authType: WidgetAuthType;
    authParamName: string;
  } {
    if (!apiKey) return { authType: 'none', authParamName: '' };
    if (apiKey.in === 'header' && apiKey.name === 'Authorization') {
      return { authType: 'bearer', authParamName: '' };
    }
    return { authType: apiKey.in, authParamName: apiKey.name };
  }

  const seededAuth = authFieldsFor(initial?.config.apiKey);

  /** The field-type menu. The enum and its labels are shared, so what this
   * offers and what the api accepts cannot drift apart. */
  const KIND_OPTIONS = DATA_KINDS.map((value) => ({ value, label: DATA_KIND_LABELS[value] }));

  /** A new widget's first slot, so the form opens on something editable. */
  function blankSlot(): SlotConfig {
    return { primitive: 'number', kind: 'number', label: '', jsonPath: '', max: 100, unit: '' };
  }

  /**
   * Keep an UNSET width tracking the primitive.
   *
   * `slotWidthFor` defaults a chart to wide and everything else to normal, and
   * that default should keep applying while the user is still choosing how to
   * draw the value. Writing the derived width into the slot the moment the
   * select is first rendered would freeze whatever the first primitive implied
   * - pick Big number, then switch to Line chart, and the chart would silently
   * stay narrow. So the select DISPLAYS the derived value and only stores one
   * when it is actually changed.
   */

  // No steps at all now. The layout picker that used to be step 1 went with the
  // US-C4 revision - a user adds values and the arrangement follows from how
  // many there are - and the title-and-accent page that used to be step 3 is
  // folded in beside the preview (see the note at the top).
  /**
   * Only ever carried, never set here. A widget saved before the revision
   * keeps its layout so it renders exactly as it did; a new one has none and
   * is arranged by slot count.
   */
  const carriedLayoutId = initial?.config.layoutId;
  let title = $state(initial?.config.title ?? '');
  let accent = $state<AccentColor>(initial?.config.accent ?? 'primary');
  /**
   * `kind` is saved on the slot now, so an edited widget reopens on the field
   * type it was actually built with. Slots written before it was persisted
   * have none, and `kindForSlot` backfills the first kind their primitive
   * accepts - which is always a legal pairing, so the already-saved primitive
   * is guaranteed to still appear in the menu.
   *
   * It was that fallback ALONE before, for every slot: a field set to Text and
   * shown as a big number came back as Number every time it was reopened,
   * because 'number' is the first kind the number primitive accepts and
   * nothing recorded the user's actual choice.
   */
  let slots = $state<SlotConfig[]>(
    initial ? initial.config.slots.map((s) => ({ ...s, kind: kindForSlot(s) })) : [blankSlot()],
  );
  let openSlot = $state(0);

  // One source for the whole widget - every slot reads a path out of the
  // same response. See the note on SlotConfig for why.
  let endpointUrl = $state(initial?.config.url ?? '');
  let authType = $state<WidgetAuthType>(seededAuth.authType);
  let authParamName = $state(seededAuth.authParamName);
  // Deliberately NOT part of `config`, and NEVER seeded from `initial` even
  // when editing - the plaintext key is not retrievable after saving
  // (FR-6.2), so there is nothing to seed it WITH. Leaving it blank on edit
  // means "keep the existing one"; see `authIncomplete` and `submit` below.
  let secret = $state('');

  // US-C1: arbitrary caller headers, independent of the auth section above -
  // this widget's api key (if any) is a placement into ONE of these, never a
  // value stored here itself (the server refuses a header name that looks
  // credential-shaped for exactly that reason - see isCredentialHeaderName).
  let headers = $state<HeaderRow[]>(initial ? initial.config.headers.map((h) => ({ ...h })) : []);

  function addHeader() {
    headers.push({ name: '', value: '' });
  }

  function removeHeader(index: number) {
    headers.splice(index, 1);
  }

  // US-C5: floored at the type's minimum by construction, not just by the
  // input's min= attribute, so a value carried in from a bad paste can't
  // sneak past a user who never touches the field.
  let refreshIntervalSeconds = $state(initial?.refreshIntervalSeconds ?? MIN_SERVER_POLL_SECONDS);

  /** Sizing hints from the slot count - see arrangementFor. */
  let slotClasses = $derived(arrangementFor(slots.length));

  function addSlot() {
    if (slots.length >= MAX_SLOTS) return;
    slots = [...slots, blankSlot()];
    openSlot = slots.length - 1;
  }

  /** Removing the last slot is refused - a widget with none has nothing to show. */
  function removeSlot(index: number) {
    if (slots.length <= 1) return;
    slots = slots.filter((_, i) => i !== index);
    openSlot = Math.min(openSlot, slots.length - 1);
  }

  /**
   * Every primitive that can render the bound field's type, suggestions first.
   *
   * The slot's class no longer FILTERS this - it only orders it. That change is
   * the point of the US-C4 revision: a single-slot widget used to offer ring,
   * number and gauge only, so a line chart or an uptime strip could not be
   * built at all without first picking a two-slot layout for a reason nothing
   * in the UI explained. The one filter left is honest - a primitive that
   * cannot draw the chosen data kind is genuinely not an option.
   */
  function allowedPrimitives(index: number): SlotPrimitive[] {
    const menu = primitivesForClass(slotClasses[index] ?? 'compact');
    const kind = kindForSlot(slots[index]);
    return menu.filter((p) => PRIMITIVE_ACCEPTS[p].includes(kind));
  }

  function setKind(index: number, kind: DataKind) {
    slots[index].kind = kind;
    // Keep the slot valid: if the current primitive can't render the new
    // type, fall back to the first one that can.
    const allowed = allowedPrimitives(index);
    if (allowed.length > 0 && !allowed.includes(slots[index].primitive)) {
      slots[index].primitive = allowed[0];
    }
  }

  let needsScale = $derived(
    slots.map((s) => s.primitive === 'ring' || s.primitive === 'gauge' || s.primitive === 'bar'),
  );

  let previewConfig = $derived<CustomWidgetConfig>({
    title: title || 'Untitled widget',
    // Undefined for a new widget, so the preview arranges by slot count -
    // exactly what the board will do with the saved config.
    layoutId: carriedLayoutId,
    accent,
    endpointUrl,
    authType,
    authParamName: authParamName || undefined,
    slots: slots.map((s, i) => ({ ...s, label: s.label || `Slot ${i + 1}` })),
  });

  let endpointOk = $derived(isValidEndpoint(endpointUrl.trim()));
  let endpointTouched = $derived(endpointUrl.trim().length > 0);
  /** A slot needs a path; without one it would render a permanent error
   * tile on the board. The endpoint is checked once, widget-level. */
  let unboundCount = $derived(slots.filter((s) => !s.jsonPath.trim()).length);
  /** An auth type picked but its name or secret left blank would create a
   * widget that expects a key it never actually stores - every poll would
   * fail with "needs an API key" (see apps/worker/src/fetchers/custom-json.ts).
   * 'bearer' has no name field of its own (see the template); it always
   * resolves to the fixed Authorization header name below, so only the
   * secret matters for it.
   *
   * US-C6: a blank secret is fine when EDITING a widget that already has one
   * saved - blank means "keep the current key," not "there is no key." The
   * credential is keyed by widget id alone, never by placement, so it stays
   * valid even if the placement (header vs query, or the name) changes
   * underneath it without a new secret being entered. */
  let authIncomplete = $derived(
    authType !== 'none' &&
      ((!secret.trim() && !hasCredential) || (authType !== 'bearer' && !authParamName.trim())),
  );
  let canSubmit = $derived(
    slots.length > 0 &&
      unboundCount === 0 &&
      endpointOk &&
      !authIncomplete &&
      refreshIntervalSeconds >= MIN_SERVER_POLL_SECONDS,
  );

  /** The real `CustomJsonApiKeyPlacement` this form's auth section resolves
   * to. 'bearer' is UI sugar over a header placement named `Authorization` -
   * the real schema has no separate "bearer" kind (Eng §7.3), so this is
   * where that convenience gets translated rather than sent as-is. */
  function apiKeyPlacement(): CustomJsonConfig['apiKey'] {
    if (authType === 'none') return undefined;
    if (authType === 'bearer') return { in: 'header', name: 'Authorization' };
    return { in: authType, name: authParamName.trim() };
  }

  /**
   * Minimum tile size for the slot count, replacing the layout's fixed pair.
   * One slot fits a 1x1; anything arranged side by side or in a grid needs
   * two columns, and a grid of five or six needs the extra row.
   */
  function minSizeForSlots(count: number): { minWidth: number; minHeight: number } {
    if (count <= 1) return { minWidth: 1, minHeight: 1 };
    if (count <= 2) return { minWidth: 2, minHeight: 1 };
    if (count <= 4) return { minWidth: 2, minHeight: 2 };
    return { minWidth: 3, minHeight: 2 };
  }

  function submit() {
    if (!canSubmit) return;
    const { minWidth, minHeight } = minSizeForSlots(slots.length);
    const apiKey = apiKeyPlacement();

    const config: CustomJsonConfig = {
      url: endpointUrl.trim(),
      method: 'GET',
      headers: headers
        .map((h) => ({ name: h.name.trim(), value: h.value.trim() }))
        .filter((h) => h.name && h.value),
      title,
      // Carried, never chosen: an edited pre-revision widget keeps the layout
      // it was saved with; a new one has none and is arranged by slot count.
      ...(carriedLayoutId ? { layoutId: carriedLayoutId } : {}),
      accent,
      slots: $state.snapshot(slots),
      ...(apiKey ? { apiKey } : {}),
    };

    // Closing is the caller's call, not this form's: onSubmit kicks off an
    // async POST (and a second PUT if there's a secret), and closing before
    // that settles would hide a rejected overlap or a failed save behind an
    // already-dismissed modal. See `submitting`/`submitError` above.
    onSubmit?.({
      widgetType: 'custom_json',
      minWidth,
      minHeight,
      refreshIntervalSeconds,
      config,
      secret: authType === 'none' ? null : secret.trim() || null,
    });
  }
</script>

<div class="flex items-center justify-between border-b border-surface-200-800 p-5">
  <div>
    <h2 class="text-lg font-semibold text-surface-950-50">
      {isEditing ? 'Edit custom widget' : 'Custom widget'}
    </h2>
    <p class="text-xs text-surface-600-400">
      One endpoint, up to {MAX_SLOTS} values read out of its response.
    </p>
  </div>
  <button
    type="button"
    onclick={onClose}
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

<div class="grid max-h-[60vh] grid-cols-1 gap-5 overflow-y-auto p-5 md:grid-cols-[1fr_260px]">
  <div class="flex flex-col gap-4">
    <!-- Above the fields it names, so a widget is titled while its values are
         being chosen rather than on a page after them. -->
    <div>
      <label for="widget-title" class="mb-1 block text-xs text-surface-600-400">Title</label>
      <input
        id="widget-title"
        type="text"
        placeholder="e.g. Home server"
        bind:value={title}
        class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
      />
    </div>
    <!-- One source for the whole widget; slots below just pick fields
         out of its response. -->
    <div class="flex flex-col gap-3 rounded-lg border border-surface-200-800 p-3">
      <p class="text-xs tracking-wide text-surface-600-400 uppercase">Data source</p>

      <div>
        <label for="endpoint" class="mb-1 block text-xs text-surface-600-400">Endpoint URL</label>
        <input
          id="endpoint"
          type="text"
          placeholder="https://home-server.local/api/stats"
          bind:value={endpointUrl}
          aria-invalid={endpointTouched && !endpointOk}
          class="w-full rounded-lg border bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
          class:border-surface-200-800={!endpointTouched || endpointOk}
          class:border-error-500={endpointTouched && !endpointOk}
        />
        {#if endpointTouched && !endpointOk}
          <p class="mt-1 text-xs text-error-500">Must be a full http:// or https:// URL.</p>
        {/if}
      </div>

      <div>
        <label for="auth" class="mb-1 block text-xs text-surface-600-400">Authentication</label>
        <select
          id="auth"
          bind:value={authType}
          class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
        >
          {#each AUTH_TYPES as auth (auth.value)}
            <option value={auth.value}>{auth.label}</option>
          {/each}
        </select>
      </div>

      {#if authType === 'header' || authType === 'query'}
        <div>
          <label for="authname" class="mb-1 block text-xs text-surface-600-400">
            {authType === 'header' ? 'Header name' : 'Query parameter name'}
          </label>
          <input
            id="authname"
            type="text"
            placeholder={authType === 'header' ? 'X-API-Key' : 'api_key'}
            bind:value={authParamName}
            class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 font-mono text-sm text-surface-950-50"
          />
        </div>
      {/if}

      {#if authType !== 'none'}
        <div>
          <label for="secret" class="mb-1 block text-xs text-surface-600-400">Token / key</label>
          <input
            id="secret"
            type="password"
            autocomplete="off"
            placeholder="••••••••••••"
            bind:value={secret}
            class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 font-mono text-sm text-surface-950-50"
          />
          <p class="mt-1 text-xs text-surface-500">
            {#if hasCredential}
              An API key is already saved for this widget. Enter a new one to replace it, or leave
              this blank to keep the current one.
            {:else}
              Stored encrypted and sent only from the server. Never shown again after saving.
            {/if}
          </p>
        </div>
      {/if}

      <div>
        <span class="mb-1 block text-xs text-surface-600-400">Headers</span>
        <div class="flex flex-col gap-2">
          {#each headers as header, i (i)}
            <div class="flex gap-2">
              <input
                type="text"
                placeholder="Header name"
                bind:value={header.name}
                aria-label="Header {i + 1} name"
                class="w-full min-w-0 flex-1 rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 font-mono text-sm text-surface-950-50"
              />
              <input
                type="text"
                placeholder="Value"
                bind:value={header.value}
                aria-label="Header {i + 1} value"
                class="w-full min-w-0 flex-1 rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 font-mono text-sm text-surface-950-50"
              />
              <button
                type="button"
                onclick={() => removeHeader(i)}
                aria-label="Remove header {i + 1}"
                class="shrink-0 rounded-lg p-2 text-surface-600-400 hover:bg-surface-100-900"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          {/each}
        </div>
        <button
          type="button"
          onclick={addHeader}
          class="mt-2 text-xs text-primary-500 hover:underline"
        >
          + Add a header
        </button>
        <p class="mt-1 text-xs text-surface-500">
          Sent with every request. For a header that carries a secret, use Authentication above
          instead - it's stored encrypted, headers here are not.
        </p>
      </div>

      <div>
        <label for="refresh" class="mb-1 block text-xs text-surface-600-400"> Refresh every </label>
        <div class="flex items-center gap-2">
          <input
            id="refresh"
            type="number"
            min={MIN_SERVER_POLL_SECONDS}
            step="60"
            bind:value={refreshIntervalSeconds}
            class="w-32 rounded-lg border bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
            class:border-surface-200-800={refreshIntervalSeconds >= MIN_SERVER_POLL_SECONDS}
            class:border-error-500={refreshIntervalSeconds < MIN_SERVER_POLL_SECONDS}
          />
          <span class="text-xs text-surface-600-400">seconds</span>
        </div>
        {#if refreshIntervalSeconds < MIN_SERVER_POLL_SECONDS}
          <p class="mt-1 text-xs text-error-500">
            Server-polled widgets refresh at least every {MIN_SERVER_POLL_SECONDS} seconds (FR-4.2).
          </p>
        {/if}
      </div>
    </div>

    <div class="flex items-center justify-between">
      <p class="text-xs tracking-wide text-surface-600-400 uppercase">
        Values ({slots.length}/{MAX_SLOTS})
      </p>
      <span class="text-xs text-surface-500">Arranged automatically</span>
    </div>

    {#each slots as slot, i (i)}
      <div class="rounded-lg border border-surface-200-800">
        <button
          type="button"
          onclick={() => (openSlot = openSlot === i ? -1 : i)}
          class="flex w-full items-center justify-between p-3 text-left"
        >
          <span class="text-sm text-surface-950-50">
            Slot {i + 1}
            <span class="text-xs text-surface-600-400">
              · {PRIMITIVE_LABELS[slot.primitive]}
            </span>
          </span>
          <span class="flex items-center gap-2">
            {#if !slot.jsonPath.trim()}
              <span class="text-xs text-warning-500">Needs a field</span>
            {/if}
            <span class="text-xs text-surface-600-400">{openSlot === i ? '−' : '+'}</span>
          </span>
        </button>

        {#if slots.length > 1}
          <!-- Outside the toggle button above: a button inside a button is
               invalid HTML and the inner one never receives the click. -->
          <div class="flex justify-end px-3 pb-2">
            <button
              type="button"
              onclick={() => removeSlot(i)}
              class="text-xs text-surface-600-400 hover:text-error-500"
            >
              Remove value
            </button>
          </div>
        {/if}

        {#if openSlot === i}
          <div class="flex flex-col gap-3 border-t border-surface-200-800 p-3">
            <div>
              <label for="label-{i}" class="mb-1 block text-xs text-surface-600-400">Label</label>
              <input
                id="label-{i}"
                type="text"
                placeholder="e.g. CPU load"
                bind:value={slot.label}
                class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
              />
            </div>

            <div>
              <label for="path-{i}" class="mb-1 block text-xs text-surface-600-400">
                JSON field path
              </label>
              <input
                id="path-{i}"
                type="text"
                placeholder="load.current"
                bind:value={slot.jsonPath}
                class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 font-mono text-sm text-surface-950-50"
              />
              <p class="mt-1 text-xs text-surface-500">
                A field inside this widget's one response.
              </p>
            </div>

            <div>
              <label for="kind-{i}" class="mb-1 block text-xs text-surface-600-400">
                Field type
              </label>
              <select
                id="kind-{i}"
                value={slot.kind ?? 'number'}
                onchange={(e) => setKind(i, e.currentTarget.value as DataKind)}
                class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
              >
                {#each KIND_OPTIONS as kind (kind.value)}
                  <option value={kind.value}>{kind.label}</option>
                {/each}
              </select>
            </div>

            <div>
              <span class="mb-1 block text-xs text-surface-600-400">Display as</span>
              {#if allowedPrimitives(i).length === 0}
                <p class="text-xs text-error-500">
                  No visualisation can render that field type. Pick a different field type.
                </p>
              {:else}
                <div class="flex flex-wrap gap-2">
                  {#each allowedPrimitives(i) as p (p)}
                    <button
                      type="button"
                      onclick={() => (slot.primitive = p)}
                      class="rounded-lg border px-3 py-1.5 text-xs"
                      class:border-primary-500={slot.primitive === p}
                      class:text-primary-500={slot.primitive === p}
                      class:border-surface-200-800={slot.primitive !== p}
                      class:text-surface-950-50={slot.primitive !== p}
                    >
                      {PRIMITIVE_LABELS[p]}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>

            <div>
              <label for="width-{i}" class="mb-1 block text-xs text-surface-600-400"> Width </label>
              <select
                id="width-{i}"
                value={slotWidthFor(slot)}
                onchange={(e) => (slot.width = e.currentTarget.value as SlotWidth)}
                class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
              >
                {#each SLOT_WIDTHS as option (option)}
                  <option value={option}>{SLOT_WIDTH_LABELS[option]}</option>
                {/each}
              </select>
              <p class="mt-1 text-xs text-surface-500">
                Wide values take the room; charts default to it.
              </p>
            </div>

            {#if needsScale[i]}
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="max-{i}" class="mb-1 block text-xs text-surface-600-400">Max</label>
                  <input
                    id="max-{i}"
                    type="number"
                    bind:value={slot.max}
                    class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
                  />
                </div>
                <div>
                  <label for="unit-{i}" class="mb-1 block text-xs text-surface-600-400">Unit</label>
                  <input
                    id="unit-{i}"
                    type="text"
                    placeholder="%"
                    bind:value={slot.unit}
                    class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
                  />
                </div>
              </div>
            {/if}

            {#if slot.primitive === 'bar'}
              <div>
                <label for="threshold-{i}" class="mb-1 block text-xs text-surface-600-400">
                  Switch to red above (% of max)
                </label>
                <input
                  id="threshold-{i}"
                  type="number"
                  placeholder="e.g. 90"
                  bind:value={slot.thresholdPct}
                  class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
                />
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}

    {#if slots.length < MAX_SLOTS}
      <button
        type="button"
        onclick={addSlot}
        class="rounded-lg border border-dashed border-surface-300-700 p-3 text-sm text-surface-600-400 hover:border-primary-500 hover:text-surface-950-50"
      >
        + Add a value
      </button>
    {:else}
      <p class="text-xs text-surface-500">
        {MAX_SLOTS} values is the most one widget can show legibly.
      </p>
    {/if}
  </div>

  <!-- Always shown: there is no layout step to get past before there is
       something to preview, and the accent sits directly under the thing it
       recolours rather than on a page of its own. -->
  {#if slots.length > 0}
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <p class="text-xs tracking-wide text-surface-600-400 uppercase">Live preview</p>
        <CustomWidget
          config={previewConfig}
          slotData={previewConfig.slots.map((s) => previewDataFor(s))}
        />
        <p class="text-xs text-surface-500">Sample values — real data comes from the endpoints.</p>
      </div>

      <div>
        <span class="mb-1 block text-xs text-surface-600-400">Accent color</span>
        <div class="flex gap-2" role="radiogroup" aria-label="Accent color">
          {#each ACCENT_COLORS as option (option.value)}
            <button
              type="button"
              role="radio"
              aria-checked={accent === option.value}
              aria-label={option.label}
              title={option.label}
              onclick={() => (accent = option.value)}
              style="background-color: var(--color-{option.value}-500);"
              class="h-7 w-7 rounded-full border-2"
              class:border-surface-950-50={accent === option.value}
              class:border-transparent={accent !== option.value}
            ></button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

{#if submitError}
  <p class="border-t border-surface-200-800 px-5 py-3 text-sm text-error-500">{submitError}</p>
{/if}

<!-- Why the submit button is refusing. This used to be a list on the last
     page reading "go back to step 2 to finish", which is no longer a thing
     that can be said - and a reason beside the button that is disabled is more
     use than one on a screen the user has already left. -->
{#if !canSubmit}
  <p class="border-t border-surface-200-800 px-5 pt-3 text-xs text-warning-500">
    {#if !endpointOk}
      This widget still needs a valid endpoint URL.
    {:else if unboundCount > 0}
      {unboundCount}
      {unboundCount > 1 ? 'values still need' : 'value still needs'} a JSON field path.
    {:else if authIncomplete}
      Authentication needs {authType !== 'bearer' && !authParamName.trim()
        ? 'a name and a token'
        : 'a token'}.
    {:else if refreshIntervalSeconds < MIN_SERVER_POLL_SECONDS}
      The refresh interval is below the {MIN_SERVER_POLL_SECONDS}-second minimum.
    {/if}
  </p>
{/if}

<div class="flex items-center justify-between border-t border-surface-200-800 p-5">
  {#if onBack}
    <button
      type="button"
      onclick={onBack}
      class="text-sm text-surface-600-400 hover:text-surface-950-50"
    >
      &larr; All templates
    </button>
  {:else}
    <span></span>
  {/if}
  <div class="flex gap-2">
    <button
      type="button"
      onclick={onClose}
      class="rounded-lg border border-surface-200-800 px-4 py-2 text-sm font-medium text-surface-950-50 hover:bg-surface-100-900"
    >
      Cancel
    </button>
    <button
      type="button"
      onclick={submit}
      disabled={!canSubmit || submitting}
      class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
    >
      {submitting ? 'Saving…' : isEditing ? 'Save changes' : 'Add widget'}
    </button>
  </div>
</div>
