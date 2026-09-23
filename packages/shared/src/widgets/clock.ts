// packages/shared/src/widgets/clock.ts
//
// F5.1 + F5.2, merged. Clock and Date/Time were two widget types that differed
// only in which parts of the same instant they printed, and neither could be
// configured at all - both rendered the browser's locale and zone with a fixed
// format. They are ONE type now whose `display` field chooses between them, so
// "show me the date too" is a setting rather than a different widget.
//
// PURELY LOCAL (Eng §7.2): no fetcher, no snapshots, no proxy. Every field here
// is read by the renderer in the browser and by nothing else, which is why the
// whole config is allowlisted through to the client (see the api's
// config-view.ts) - there is nothing in it that is not already the user's own
// display choice.
//
// The legacy `datetime` type id is NOT removed. It stays registered, hidden
// from the catalog, and parses this same schema, because the `widget_type`
// CHECK constraint still lists it and removing a value from a constraint while
// the old code is still serving traffic is exactly the rename-plus-behaviour
// change CLAUDE.md's migration policy forbids in one release. The rows are
// migrated to `clock`; the id is retired separately, later, or never.

import { z } from 'zod';

export const CLOCK_DISPLAYS = ['time', 'date', 'both'] as const;
export const ClockDisplay = z.enum(CLOCK_DISPLAYS, {
  error: 'Choose whether to show the time, the date, or both.',
});
export type ClockDisplay = z.infer<typeof ClockDisplay>;

/**
 * A curated zone list rather than free text.
 *
 * Any IANA name would be validatable (`Intl.DateTimeFormat` throws on an
 * unknown one), but the generic config form renders an enum as a select and a
 * string as a text box - and a text box asking a user to type
 * "America/St_Johns" exactly is a worse control than a list they cannot get
 * wrong. `local` means the viewer's own zone, which is what both widgets did
 * before they had a setting, so it stays the default.
 */
export const CLOCK_TIME_ZONES = [
  'local',
  'UTC',
  'America/St_Johns',
  'America/Halifax',
  'America/Toronto',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Vancouver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Moscow',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const;
export const ClockTimeZone = z.enum(CLOCK_TIME_ZONES, { error: 'Choose a time zone.' });
export type ClockTimeZone = z.infer<typeof ClockTimeZone>;

/** Maps straight onto `Intl.DateTimeFormat`'s `dateStyle`. */
export const CLOCK_DATE_STYLES = ['full', 'long', 'medium', 'short'] as const;
export const ClockDateStyle = z.enum(CLOCK_DATE_STYLES, { error: 'Choose a date format.' });
export type ClockDateStyle = z.infer<typeof ClockDateStyle>;

/** Only matters when `display` shows the time; the date is text either way. */
export const CLOCK_FACES = ['digital', 'analog'] as const;
export const ClockFace = z.enum(CLOCK_FACES, { error: 'Choose a clock face.' });
export type ClockFace = z.infer<typeof ClockFace>;

export const CLOCK_LABEL_MAX_LENGTH = 40;

/**
 * Every field carries a default, so `{}` is a valid config. That is what lets
 * the two widgets already sitting in the demo seed - written when this type had
 * no schema at all - keep parsing without a backfill, and it is why the
 * migration that merges them can set `display` explicitly and leave the rest
 * alone.
 *
 * `.describe()` on each field is the label the generic form shows. Without it
 * the form falls back to the raw key, which is how `uptime` ended up with a
 * field labelled "url".
 */
export const ClockConfig = z
  .strictObject({
    display: ClockDisplay.default('both').describe('Show'),
    face: ClockFace.default('digital').describe('Clock face'),
    timeZone: ClockTimeZone.default('local').describe('Time zone'),
    hour12: z.boolean().default(true).describe('12-hour clock'),
    showSeconds: z.boolean().default(true).describe('Show seconds'),
    dateStyle: ClockDateStyle.default('full').describe('Date format'),
    label: z
      .string()
      .trim()
      .max(CLOCK_LABEL_MAX_LENGTH, `A label can be at most ${CLOCK_LABEL_MAX_LENGTH} characters.`)
      .default('')
      .describe('Label (optional)'),
  })
  .describe('Clock and date widget configuration');

export type ClockConfig = z.infer<typeof ClockConfig>;

/**
 * Resolve the zone for `Intl`: `undefined` means "the viewer's own", which is
 * what `Intl` already does when the option is absent.
 */
export function resolveTimeZone(timeZone: ClockTimeZone | undefined): string | undefined {
  return !timeZone || timeZone === 'local' ? undefined : timeZone;
}
