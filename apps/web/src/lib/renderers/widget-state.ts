// apps/web/src/lib/renderers/widget-state.ts
//
// Which of loading, value or error a widget is in, from its latest snapshot
// alone (Story #224, Task #243). One place every renderer asks, instead of
// each inventing its own rules.

import type { LatestSnapshot } from '@widgetry/shared';

export type WidgetState = 'loading' | 'value' | 'error';

export function widgetState(latest: LatestSnapshot | null | undefined): WidgetState {
  if (latest == null) return 'loading';
  return latest.error != null ? 'error' : 'value';
}
