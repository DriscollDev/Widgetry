// packages/shared/src/widgets/types.ts
//
// EX-19: the shape of a widget type definition. Authority: Eng §7.1.
//
// A widget type is DATA, not a class hierarchy - one object per type, collected
// into a registry (./registry.ts). Adding a type is a code change and never a
// migration: `widgets.config` is jsonb and `widgets.widget_type` is a text
// column with a CHECK constraint listing the seven MVP values (FR-3.6).
//
// This module is imported by web, api AND worker, so it must stay free of
// anything Node- or browser-specific. The fetchers that consume `polling`
// live in apps/worker/src/fetchers/ and are deliberately NOT referenced here -
// the registry describes types, it does not wire them to runtimes.

import type { z } from 'zod';
import type { WidgetType } from '../api/widgets.js';

/**
 * Frontend hint for which renderer component draws the widget. A hint, not a
 * contract: the renderer chooses the component, the config schema decides what
 * it is given. Eng §7.1.
 */
export type WidgetRenderer = 'status' | 'value' | 'timeline' | 'custom';

/** Grouping for the widget-catalog picker (SCR-MOD-04). Eng §7.1. */
export type WidgetCategory = 'monitoring' | 'informational' | 'custom';

/**
 * Where a widget's data comes from. Mirrors the `widgets.polling_mode` column
 * and its CHECK constraint, which has only these two values - the third runtime
 * profile (purely local: Clock, Date/Time) is stored as 'client' because it
 * needs no server work at all (Eng §7.2). Read `polling === 'server'` as "the
 * worker must poll this", never as "this widget makes an HTTP request".
 */
export type WidgetPolling = 'client' | 'server';

export type WidgetTypeDef = {
  id: WidgetType;
  displayName: string;
  category: WidgetCategory;
  /**
   * Validated on widget create and update. The parsed output is what lands in
   * the `widgets.config` jsonb column - so this schema is the ONLY definition of
   * what a widget of this type may be configured with, and both web (to build
   * the form, Eng §7.4) and api (to validate the write) read it from here.
   */
  configSchema: z.ZodType;
  renderer: WidgetRenderer;
  polling: WidgetPolling;
  /**
   * Whether snapshots accumulate for this type, and therefore whether the
   * timeline chart and `GET /v1/widgets/:id/snapshots` are offered (FR-5.1).
   * Only meaningful when `polling === 'server'`: nothing else writes snapshots.
   */
  supportsHistory: boolean;
  /**
   * Seeded into `widgets.refresh_interval_seconds` at create time and used as
   * the jitter window for `last_polled_at` (Eng §5.2). Null for client-polled
   * types, which have no worker cadence - their refresh is the BOARD's interval
   * (FR-4.1), a different column entirely (see the terminology trap in
   * CLAUDE.md).
   */
  defaultRefreshSeconds: number | null;
  /**
   * Enforced server-side on update. Null for client-polled types. FR-4.2 sets
   * the floor for every server-polled type at one hour, and the
   * `widgets_refresh_interval_check` constraint enforces the same 3600 - a type
   * may raise its own floor above that, never lower it.
   */
  minRefreshSeconds: number | null;
};

/**
 * A server-polled type, narrowed so the fields that are null-by-construction for
 * client types are non-null. The worker only ever handles these, and this is
 * what lets `scheduleFor(def)` read `def.minRefreshSeconds` without a null check
 * that could only ever be dead code.
 */
export type ServerPolledWidgetTypeDef = WidgetTypeDef & {
  polling: 'server';
  defaultRefreshSeconds: number;
  minRefreshSeconds: number;
};
