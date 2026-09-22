<script lang="ts">
  // The custom widget's three-step flow: pick a layout, bind each slot,
  // then style. This is the whole modal CONTENT (header/body/footer) minus
  // the Modal wrapper, so it can be dropped into the template picker as
  // its "Custom" branch without duplicating any of it.
  //
  // The "Field type" select in step 2 is a placeholder for binding-by-click:
  // once the modal can fetch the endpoint and show its JSON tree, the type
  // is read from the chosen field and this control disappears.

  import { MIN_SERVER_POLL_SECONDS, type CustomJsonConfig } from '@widgetry/shared';
  import CustomWidget from '../widgets/custom/CustomWidget.svelte';
  import { previewDataFor } from './custom-widget-preview';
  import { ACCENT_COLORS, type AccentColor } from '../widgets/accent';
  import {
    LAYOUTS,
    PRIMITIVES_BY_CLASS,
    PRIMITIVE_ACCEPTS,
    PRIMITIVE_LABELS,
    AUTH_TYPES,
    getLayout,
    isValidEndpoint,
    type WidgetAuthType,
    type CustomWidgetConfig,
    type CustomWidgetSubmission,
    type DataKind,
    type LayoutId,
    type SlotConfig,
    type SlotPrimitive,
  } from '../widgets/custom/types';

  /** One row of the general headers list (US-C1). Separate from the auth
   * section below - this is arbitrary caller headers, not the credential. */
  type HeaderRow = { name: string; value: string };

  type Props = {
    onClose: () => void;
    onSubmit?: (submission: CustomWidgetSubmission) => void;
    /** Supplied when this is reached from the template picker - step 1's
     * back button then returns to the template list instead of vanishing. */
    onBack?: () => void;
    /** The caller's in-flight state for the async work `onSubmit` kicks off
     * (the widget POST, then a credential PUT if there's a secret) - this
     * form has no fetch of its own, so it cannot know that on its own. */
    submitting?: boolean;
    /** Surfaced from the caller's own POST/PUT, e.g. a rejected overlap or a
     * credential save failure after the widget itself was created. */
    submitError?: string | null;
  };

  let { onClose, onSubmit, onBack, submitting = false, submitError = null }: Props = $props();

  const DATA_KINDS: { value: DataKind; label: string }[] = [
    { value: 'number', label: 'Number' },
    { value: 'string', label: 'Text' },
    { value: 'series', label: 'List of numbers' },
    { value: 'status', label: 'Status' },
    { value: 'status-series', label: 'List of statuses' },
  ];

  let step = $state<1 | 2 | 3>(1);
  let layoutId = $state<LayoutId | null>(null);
  let title = $state('');
  let accent = $state<AccentColor>('primary');
  let slots = $state<SlotConfig[]>([]);
  let slotKinds = $state<DataKind[]>([]);
  let openSlot = $state(0);

  // One source for the whole widget - every slot reads a path out of the
  // same response. See the note on SlotConfig for why.
  let endpointUrl = $state('');
  let authType = $state<WidgetAuthType>('none');
  let authParamName = $state('');
  // Deliberately NOT part of `config`: keeping the credential in separate
  // state means it cannot be serialised into widgets.config by accident.
  let secret = $state('');

  // US-C1: arbitrary caller headers, independent of the auth section above -
  // this widget's api key (if any) is a placement into ONE of these, never a
  // value stored here itself (the server refuses a header name that looks
  // credential-shaped for exactly that reason - see isCredentialHeaderName).
  let headers = $state<HeaderRow[]>([]);

  function addHeader() {
    headers.push({ name: '', value: '' });
  }

  function removeHeader(index: number) {
    headers.splice(index, 1);
  }

  // US-C5: floored at the type's minimum by construction, not just by the
  // input's min= attribute, so a value carried in from a bad paste can't
  // sneak past a user who never touches the field.
  let refreshIntervalSeconds = $state(MIN_SERVER_POLL_SECONDS);

  let layout = $derived(layoutId ? getLayout(layoutId) : null);

  /** Carries existing bindings across a layout change, matched by slot
   * index. Going back to step 1 and re-picking must not silently discard
   * paths the user already typed - including when they re-pick the layout
   * they were already on. Slots beyond the new layout's count are dropped,
   * which is unavoidable when shrinking. The endpoint is widget-level, so
   * it survives regardless. */
  function pickLayout(id: LayoutId) {
    const def = getLayout(id);
    const carried = slots;
    const carriedKinds = slotKinds;

    layoutId = id;
    slotKinds = def.slotClasses.map((_, i) => carriedKinds[i] ?? ('number' as DataKind));
    slots = def.slotClasses.map((slotClass, i) => {
      const prev = carried[i];
      const menu = PRIMITIVES_BY_CLASS[slotClass];
      const legal = menu.filter((p) => PRIMITIVE_ACCEPTS[p].includes(slotKinds[i]));
      // Keep the previous primitive when the new slot class still offers
      // it; otherwise fall back to that class's first legal option.
      const primitive =
        prev && legal.includes(prev.primitive) ? prev.primitive : (legal[0] ?? menu[0]);

      return {
        primitive,
        label: prev?.label ?? '',
        jsonPath: prev?.jsonPath ?? '',
        max: prev?.max ?? 100,
        unit: prev?.unit ?? '',
        thresholdPct: prev?.thresholdPct,
        thresholdColor: prev?.thresholdColor,
      };
    });
    openSlot = 0;
    step = 2;
  }

  /** A primitive is offered only if its slot class lists it AND it can
   * render the bound field's type. */
  function allowedPrimitives(index: number): SlotPrimitive[] {
    if (!layout) return [];
    const forClass = PRIMITIVES_BY_CLASS[layout.slotClasses[index]];
    return forClass.filter((p) => PRIMITIVE_ACCEPTS[p].includes(slotKinds[index]));
  }

  function setKind(index: number, kind: DataKind) {
    slotKinds[index] = kind;
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
    layoutId: layoutId ?? 'single',
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
   * secret matters for it. */
  let authIncomplete = $derived(
    authType !== 'none' && (!secret.trim() || (authType !== 'bearer' && !authParamName.trim())),
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

  function submit() {
    if (!layoutId || !canSubmit) return;
    const def = getLayout(layoutId);
    const apiKey = apiKeyPlacement();

    const config: CustomJsonConfig = {
      url: endpointUrl.trim(),
      method: 'GET',
      headers: headers
        .map((h) => ({ name: h.name.trim(), value: h.value.trim() }))
        .filter((h) => h.name && h.value),
      title,
      layoutId,
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
      minWidth: def.minWidth,
      minHeight: def.minHeight,
      refreshIntervalSeconds,
      config,
      secret: authType === 'none' ? null : secret.trim() || null,
    });
  }
</script>

<div class="flex items-center justify-between border-b border-surface-200-800 p-5">
  <div>
    <h2 class="text-lg font-semibold text-surface-950-50">Custom widget</h2>
    <p class="text-xs text-surface-600-400">
      Step {step} of 3 ·
      {step === 1 ? 'Choose a layout' : step === 2 ? 'Bind each slot' : 'Title and style'}
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
    {#if step === 1}
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {#each LAYOUTS as def (def.id)}
          <button
            type="button"
            onclick={() => pickLayout(def.id)}
            class="flex flex-col items-start gap-1 rounded-lg border border-surface-200-800 bg-surface-100-900 p-3 text-left hover:border-primary-500"
          >
            <span class="text-sm font-medium text-surface-950-50">{def.name}</span>
            <span class="text-xs text-surface-600-400">{def.description}</span>
            <span class="font-mono text-xs text-surface-500">
              {def.slotClasses.length} slot{def.slotClasses.length > 1 ? 's' : ''} · min {def.minWidth}×{def.minHeight}
            </span>
          </button>
        {/each}
      </div>
    {:else if step === 2 && layout}
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
              Stored encrypted and sent only from the server. Never shown again after saving.
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
          <label for="refresh" class="mb-1 block text-xs text-surface-600-400">
            Refresh every
          </label>
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
                · {layout.slotClasses[i]} · {PRIMITIVE_LABELS[slot.primitive]}
              </span>
            </span>
            <span class="flex items-center gap-2">
              {#if !slot.jsonPath.trim()}
                <span class="text-xs text-warning-500">Needs a field</span>
              {/if}
              <span class="text-xs text-surface-600-400">{openSlot === i ? '−' : '+'}</span>
            </span>
          </button>

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
                  value={slotKinds[i]}
                  onchange={(e) => setKind(i, e.currentTarget.value as DataKind)}
                  class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
                >
                  {#each DATA_KINDS as kind (kind.value)}
                    <option value={kind.value}>{kind.label}</option>
                  {/each}
                </select>
              </div>

              <div>
                <span class="mb-1 block text-xs text-surface-600-400">Display as</span>
                {#if allowedPrimitives(i).length === 0}
                  <p class="text-xs text-error-500">
                    No {layout.slotClasses[i]} display can render that field type. Pick another type or
                    another layout.
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
                    <label for="unit-{i}" class="mb-1 block text-xs text-surface-600-400"
                      >Unit</label
                    >
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
    {:else}
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
      {#if !endpointOk}
        <p class="text-xs text-warning-500">
          This widget still needs a valid endpoint URL. Go back to step 2 to finish.
        </p>
      {/if}
      {#if unboundCount > 0}
        <p class="text-xs text-warning-500">
          {unboundCount} slot{unboundCount > 1 ? 's' : ''} still {unboundCount > 1
            ? 'need'
            : 'needs'}
          a field path. Go back to step 2 to finish.
        </p>
      {/if}
      {#if authIncomplete}
        <p class="text-xs text-warning-500">
          Authentication needs {authType !== 'bearer' && !authParamName.trim()
            ? 'a name and a token'
            : 'a token'}. Go back to step 2 to finish.
        </p>
      {/if}
      {#if refreshIntervalSeconds < MIN_SERVER_POLL_SECONDS}
        <p class="text-xs text-warning-500">
          The refresh interval is below the {MIN_SERVER_POLL_SECONDS}-second minimum. Go back to
          step 2 to finish.
        </p>
      {/if}
    {/if}
  </div>

  {#if step > 1 && layoutId}
    <div class="flex flex-col gap-2">
      <p class="text-xs tracking-wide text-surface-600-400 uppercase">Live preview</p>
      <CustomWidget
        config={previewConfig}
        slotData={previewConfig.slots.map((s) => previewDataFor(s))}
      />
      <p class="text-xs text-surface-500">Sample values — real data comes from the endpoints.</p>
    </div>
  {/if}
</div>

{#if submitError}
  <p class="border-t border-surface-200-800 px-5 py-3 text-sm text-error-500">{submitError}</p>
{/if}

<div class="flex items-center justify-between border-t border-surface-200-800 p-5">
  {#if step > 1}
    <button
      type="button"
      onclick={() => (step = step === 3 ? 2 : 1)}
      class="text-sm text-surface-600-400 hover:text-surface-950-50"
    >
      &larr; Back
    </button>
  {:else if onBack}
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
    {#if step === 2}
      <button
        type="button"
        onclick={() => (step = 3)}
        class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium"
      >
        Next
      </button>
    {:else if step === 3}
      <button
        type="button"
        onclick={submit}
        disabled={!canSubmit || submitting}
        class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Add widget'}
      </button>
    {/if}
  </div>
</div>
