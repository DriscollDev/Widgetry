// packages/shared/src/widgets/clock.ts
//
// F5.1: Clock widget config - timezone and face (Task #231, follow-up from
// #228). Purely local (Eng §7.2): read by the renderer only, never touches
// the worker.

import { z } from 'zod';
import { TimeZone } from './timezone.js';

export const CLOCK_FACES = ['digital', 'analog'] as const;
export const ClockFace = z.enum(CLOCK_FACES, { error: 'Choose a clock face.' });
export type ClockFace = z.infer<typeof ClockFace>;

export const ClockConfig = z
  .strictObject({
    timezone: TimeZone.optional(),
    face: ClockFace.optional(),
  })
  .describe('Clock widget configuration');

export type ClockConfig = z.infer<typeof ClockConfig>;
