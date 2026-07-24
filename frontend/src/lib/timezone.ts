/** The merchant's own timezone, so server-side aggregates bucket by their
 *  calendar day (e.g. a 01:00 Nairobi sale isn't counted against the previous
 *  day). Shared verbatim across dashboard pages that call the same
 *  timezone-aware RPCs, so their query keys — and therefore query cache —
 *  line up. */
export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
