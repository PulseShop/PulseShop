/**
 * The app version, in one place.
 *
 * It was hardcoded in the dashboard sidebar, which is exactly where a version
 * string goes stale: it is displayed once, nothing reads it, and nobody
 * remembers it exists. Bumping it is a release step, so it needs to be a single
 * grep-able constant rather than a literal buried in JSX.
 *
 * Convention: bump by 0.1 on every commit.
 *
 * NOT frontend/package.json's `version`. That field has to be valid semver
 * (x.y.z) and belongs to a private package that is never published, so keeping
 * the two in sync would mean maintaining two numbers to serve one purpose.
 */
export const APP_VERSION = "12.37";

/** As shown to the user, e.g. in the dashboard sidebar. */
export const APP_VERSION_LABEL = `PulseShop v${APP_VERSION}`;
