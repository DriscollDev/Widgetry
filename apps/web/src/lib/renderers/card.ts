// apps/web/src/lib/renderers/card.ts
//
// The one definition of a widget tile's card.
//
// BoardView's grid cell used to draw this (a background, a border and a
// radius); US-H3 removed it as redundant chrome, which left each renderer
// responsible for its own. Uptime and Custom JSON already drew one with these
// exact Tailwind classes, and #266 had to hand-write the same card a third,
// fourth and fifth time as raw CSS in Clock, Date/Time and the fallback -
// `light-dark(var(--color-surface-50), var(--color-surface-950))` being what
// `bg-surface-50-950` compiles to. Adding the weather, currency and stock
// renderers would have made it eight copies.
//
// Semantic Skeleton pairs, never raw hex or hand-rolled light-dark() (Design
// Principles §3.2): the tokens already carry the theme switch.

/** Layout is the caller's - this is only the card itself. */
export const WIDGET_CARD =
  'h-full w-full box-border rounded-xl border border-surface-200-800 bg-surface-50-950 p-4';

/**
 * The card for a widget that cannot show its value. Same shape, error-tinted
 * border - never colour alone: every caller pairs it with an icon and a
 * sentence (Design Principles §3.4).
 */
export const WIDGET_CARD_ERROR =
  'h-full w-full box-border rounded-xl border border-error-500/40 bg-surface-50-950 p-4';
