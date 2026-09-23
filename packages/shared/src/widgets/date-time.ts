// packages/shared/src/widgets/date-time.ts
//
// F5.2: Date & Time widget config - timezone and time format (Task #231,
// follow-up from #228). Purely local (Eng §7.2), same as Clock.

import { z } from 'zod';
import { TimeZone } from './timezone.js';

export const DATE_TIME_FORMATS = ['12h', '24h'] as const;
export const DateTimeFormat = z.enum(DATE_TIME_FORMATS, { error: 'Choose a time format.' });
export type DateTimeFormat = z.infer<typeof DateTimeFormat>;

export const DateTimeConfig = z
  .strictObject({
    timezone: TimeZone.optional(),
    format: DateTimeFormat.optional(),
  })
  .describe('Date & Time widget configuration');

export type DateTimeConfig = z.infer<typeof DateTimeConfig>;
