// apps/worker/src/fetchers/uptime.ts
//
// US-W-Uptime: ping a user-supplied URL, record whether it answered and how
// fast. Feature Spec §4.4, §8.1 (Downdetector dropped - this is a direct HTTP
// GET and depends on no third party).
//
// ---------------------------------------------------------------------------
// THIS FETCHER GOES THROUGH THE SSRF GATE, AND THE SPEC DOES NOT SAY SO
// ---------------------------------------------------------------------------
// Feature Spec §6.3 and Eng §11.3 both scope SSRF protection to "custom
// widgets". Read literally, an uptime widget would be exempt - and that is a gap
// in the documents, not a decision. The uptime widget takes an arbitrary
// user-supplied URL and makes the worker issue a server-side GET to it, which is
// the same primitive the custom JSON widget has and therefore the same
// vulnerability: `http://169.254.169.254/latest/meta-data/` is as reachable from
// an uptime widget as from a custom one, and the response time alone is enough
// to port-scan the internal network a request at a time.
//
// So the gate applies here too. The invariant that matters is "every outbound
// request built from user input is validated", not "every custom widget is
// validated"; ../lib/safe-fetch.ts is the only way out of this process for such
// a request, by construction.
//
// ACTION: §6.3 and §11.3 should be reworded from "custom widgets" to
// "user-supplied URLs" via /doc-sync.

import { UptimeConfig, uptimeStatusFor, type UptimeSnapshotValue } from '@widgetry/shared';
import { safeFetch } from '../lib/safe-fetch.js';
import { configInvalid, type Fetcher, type FetchOutcome } from './types.js';

/**
 * A target that did not answer.
 *
 * This is a `value`, not an `error`, and the distinction is the whole point of
 * the widget: a refused connection, a DNS miss or a five-second silence is the
 * measurement succeeding and reporting bad news. An `error` snapshot would mean
 * we failed to conduct the test at all, which is a different thing to show the
 * user and a different thing to chart - see the note on `UptimeSnapshotValue`.
 *
 * `responseTimeMs` is still recorded, so a chart of response time keeps its
 * x-axis continuous across an outage instead of developing a hole.
 */
function down(responseTimeMs: number): FetchOutcome {
  const value: UptimeSnapshotValue = { status: 'down', httpStatus: null, responseTimeMs };
  return { ok: true, value };
}

export const uptimeFetcher: Fetcher = async (rawConfig, ctx) => {
  const parsed = UptimeConfig.safeParse(rawConfig);
  if (!parsed.success) {
    return configInvalid('This uptime widget has no valid URL configured.');
  }

  const result = await safeFetch({
    url: parsed.data.url,
    // A liveness check needs the status line and nothing else. Not reading the
    // body means a target serving a large file costs us its headers, not its
    // payload, every hour - and it keeps the widget honest about what it
    // measures: time to first response, not time to download.
    readBody: false,
  });

  if (result.ok) {
    const value: UptimeSnapshotValue = {
      status: uptimeStatusFor(result.status),
      httpStatus: result.status,
      responseTimeMs: result.elapsedMs,
    };
    ctx.log.debug(
      {
        widgetId: ctx.widgetId,
        status: value.status,
        httpStatus: result.status,
        redirects: result.redirects,
      },
      'uptime poll complete',
    );
    return { ok: true, value };
  }

  switch (result.failure) {
    // Our refusal, not the target's failure. The user must change the URL, so
    // this is an error state rather than a "down" reading that would wrongly
    // suggest the target is at fault. The detail - which range matched, what the
    // host resolved to - stays in the log: telling the user "10.0.0.5 is inside
    // blocked range 10.0.0.0/8" would hand them the internal-network map that
    // the gate exists to withhold.
    case 'blocked':
      ctx.log.warn(
        { widgetId: ctx.widgetId, detail: result.detail },
        'uptime poll blocked by SSRF gate',
      );
      return {
        ok: false,
        error: {
          kind: 'blocked',
          message: 'That address cannot be monitored. Use a publicly reachable http(s) URL.',
        },
        retryable: false,
      };

    // Should be unreachable: the api validated this URL against the same scheme
    // and shape rules on write. Reachable only if a row predates the schema or
    // was written outside the api.
    case 'invalid_url':
      ctx.log.warn(
        { widgetId: ctx.widgetId, detail: result.detail },
        'uptime widget has an unusable URL',
      );
      return configInvalid('This uptime widget has no valid URL configured.');

    // Everything else is the target failing to answer, which is the reading.
    //
    // Note there is no retry anywhere in this fetcher, by design. The framework
    // supports retries (Eng §8.2) and the custom JSON fetcher will want them,
    // but for uptime a retry would actively corrupt the measurement: three
    // attempts over 90 seconds that eventually succeed would record "up" for a
    // host that was down when we asked. The snapshot answers "was it responding
    // at `captured_at`", and that question only accepts one attempt.
    case 'timeout':
    case 'network':
    case 'too_large':
    case 'too_many_redirects':
      ctx.log.debug(
        { widgetId: ctx.widgetId, failure: result.failure, detail: result.detail },
        'uptime poll: target did not answer',
      );
      return down(result.elapsedMs);
  }
};
