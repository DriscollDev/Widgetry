// packages/shared/src/widgets/timezone.ts
//
// The IANA time zone field shared by Clock (F5.1) and Date/Time (F5.2) config.
// Optional everywhere it's used - an absent timezone means "the browser's own",
// which the renderer gets for free by passing no `timeZone` to Intl.

import { z } from 'zod';

/** Every IANA zone name the runtime's Intl implementation recognizes. */
function ianaTimeZones(): readonly string[] {
  return Intl.supportedValuesOf('timeZone');
}

export const TimeZone = z
  .string({ error: 'Choose a time zone.' })
  .refine((tz) => ianaTimeZones().includes(tz), { message: 'Not a recognized time zone.' });

export type TimeZone = z.infer<typeof TimeZone>;
