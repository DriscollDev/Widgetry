<!--
  The board fields SCR-MOD-01 (create) and SCR-MOD-02 (settings) share
  (FR-2.2, FR-2.3): name 1-64 characters, whitespace-only rejected; refresh
  mode; interval, shown only for auto. Duplicate names are allowed.

  Renders inputs only - the enclosing modal owns the <form> and its action.
  `validateName()` is exported so the modal can run it before submitting.
-->
<script lang="ts">
  import { BOARD_NAME_MAX_LENGTH, BoardName, type BoardRefreshMode } from '@widgetry/shared';
  import { fieldError } from '$lib/auth-forms';
  import { REFRESH_INTERVAL_OPTIONS, type BoardFieldErrors } from '$lib/board-forms';

  type Props = {
    /** Keeps element ids unique if two of these are ever mounted at once. */
    idPrefix: string;
    name: string;
    refreshMode: BoardRefreshMode;
    refreshIntervalSeconds: number;
    /** From the last failed submission, if any. */
    serverErrors?: BoardFieldErrors | null;
  };

  let {
    idPrefix,
    name = $bindable(),
    refreshMode = $bindable(),
    refreshIntervalSeconds = $bindable(),
    serverErrors = null,
  }: Props = $props();

  let nameError = $state('');

  const shownNameError = $derived(nameError || serverErrors?.name || '');

  export function validateName(): boolean {
    nameError = fieldError(BoardName, name);
    return !nameError;
  }

  export function reset(): void {
    nameError = '';
  }
</script>

<div>
  <label for="{idPrefix}-name" class="mb-1.5 block text-sm font-medium">Name</label>
  <input
    id="{idPrefix}-name"
    name="name"
    type="text"
    maxlength={BOARD_NAME_MAX_LENGTH}
    autocomplete="off"
    placeholder="Production APIs"
    bind:value={name}
    onblur={() => name && validateName()}
    aria-invalid={!!shownNameError}
    aria-describedby={shownNameError ? `${idPrefix}-name-error` : undefined}
    class="input w-full"
  />
  {#if shownNameError}
    <p id="{idPrefix}-name-error" class="mt-1 text-xs text-error-600-400">{shownNameError}</p>
  {/if}
</div>

<fieldset>
  <legend class="mb-1.5 text-sm font-medium">Refresh</legend>
  <div class="flex gap-4">
    <label class="flex items-center gap-2 text-sm">
      <input type="radio" name="refreshMode" value="auto" bind:group={refreshMode} class="radio" />
      Automatic
    </label>
    <label class="flex items-center gap-2 text-sm">
      <input
        type="radio"
        name="refreshMode"
        value="manual"
        bind:group={refreshMode}
        class="radio"
      />
      Manual
    </label>
  </div>
  {#if serverErrors?.refreshMode}
    <p class="mt-1 text-xs text-error-600-400">{serverErrors.refreshMode}</p>
  {/if}
</fieldset>

{#if refreshMode === 'auto'}
  <div>
    <label for="{idPrefix}-interval" class="mb-1.5 block text-sm font-medium">Refresh every</label>
    <select
      id="{idPrefix}-interval"
      name="refreshIntervalSeconds"
      bind:value={refreshIntervalSeconds}
      class="select w-full"
    >
      {#each REFRESH_INTERVAL_OPTIONS as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
    {#if serverErrors?.refreshIntervalSeconds}
      <p class="mt-1 text-xs text-error-600-400">{serverErrors.refreshIntervalSeconds}</p>
    {/if}
  </div>
{:else}
  <p class="text-xs text-surface-600-400">The board updates only when you refresh it yourself.</p>
{/if}
