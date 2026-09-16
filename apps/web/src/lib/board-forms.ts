// apps/web/src/lib/board-forms.ts
//
// Form plumbing for the board screens (SCR-APP-01, SCR-MOD-01/02). The rules
// themselves live in @widgetry/shared's board contracts - this module only
// turns FormData into the shape that schema expects, and turns the schema's (or
// the api's) issues back into per-field messages.

import { BOARD_REFRESH_INTERVALS_SECONDS, type BoardResponse } from '@widgetry/shared';

/** FR-2.3's six values, labelled for the interval select. */
export const REFRESH_INTERVAL_OPTIONS: readonly { value: number; label: string }[] =
  BOARD_REFRESH_INTERVALS_SECONDS.map((value) => ({ value, label: formatInterval(value) }));

/**
 * Preselected in SCR-MOD-01. Not specified anywhere - five minutes is the
 * middle of the FR-2.3 range and cheap for a board of 20 widgets.
 */
export const DEFAULT_REFRESH_INTERVAL_SECONDS = 300;

export function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  if (seconds < 3600) return `${seconds / 60} min`;
  return `${seconds / 3600} hr`;
}

/** One-line refresh summary for a board card. */
export function formatRefresh(
  board: Pick<BoardResponse, 'refreshMode' | 'refreshIntervalSeconds'>,
): string {
  return board.refreshMode === 'auto' && board.refreshIntervalSeconds !== null
    ? `Auto-refresh every ${formatInterval(board.refreshIntervalSeconds)}`
    : 'Manual refresh';
}

export interface BoardFieldErrors {
  name: string | null;
  refreshMode: string | null;
  refreshIntervalSeconds: string | null;
}

/** What the board form actions (create, update) return via `fail()`. */
export interface BoardFormResult {
  message: string | null;
  fieldErrors: BoardFieldErrors;
}

export const NO_FIELD_ERRORS: BoardFieldErrors = {
  name: null,
  refreshMode: null,
  refreshIntervalSeconds: null,
};

/**
 * Read the fields SCR-MOD-01 and SCR-MOD-02 share, in the shape
 * CreateBoardRequest and UpdateBoardRequest both accept.
 *
 * The interval is dropped (null) in manual mode, because the contract rejects
 * an interval on a manual board and the select is merely hidden, not removed,
 * when manual is chosen.
 */
export function readBoardForm(form: FormData): Record<string, unknown> {
  const rawMode = String(form.get('refreshMode') ?? '');
  return {
    name: String(form.get('name') ?? ''),
    // Passed through unnormalized so a tampered value fails the enum check
    // rather than silently becoming 'auto'.
    refreshMode: rawMode,
    refreshIntervalSeconds: rawMode === 'auto' ? Number(form.get('refreshIntervalSeconds')) : null,
  };
}

/**
 * Map issues onto the form's fields. Accepts both Zod issues (array paths) and
 * the api's `validation_failed` details (dotted string paths, see
 * apps/api/src/lib/errors.ts). The first message per field wins.
 */
export function toFieldErrors(
  issues: readonly { path: readonly PropertyKey[] | string; message: string }[],
): BoardFieldErrors {
  const errors: BoardFieldErrors = { ...NO_FIELD_ERRORS };
  for (const issue of issues) {
    const key =
      typeof issue.path === 'string'
        ? (issue.path.split('.')[0] ?? '')
        : String(issue.path[0] ?? '');
    if (key in errors && errors[key as keyof BoardFieldErrors] === null) {
      errors[key as keyof BoardFieldErrors] = issue.message;
    }
  }
  return errors;
}
