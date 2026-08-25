/** Network helpers for offline-first POS. */

/** After a network failure, skip remote calls for this long (use IndexedDB). */
const UNREACHABLE_COOLDOWN_MS = 45_000;

/** Cold-start friendly budget for manual / reconnect catch-up sync. */
const EXTENDED_SYNC_TIMEOUT_MS = 45_000;

let forcedOfflineUntil = 0;
let consecutiveFailures = 0;
/** When set, apiTimeoutMs() uses this instead of the short interactive budget. */
let syncTimeoutOverrideMs: number | null = null;

export function isBrowserOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/**
 * Effective connectivity for POS.
 * False when the browser reports offline OR we recently confirmed the API
 * is unreachable (avoids long hangs while Wi‑Fi says "online").
 *
 * User-facing Online/Offline labels should use {@link isBrowserOnline} (or the
 * sync engine's `online` flag, which tracks the browser), not this helper —
 * a single cold-start timeout must not flip the status badge during catch-up.
 */
export function isOnline() {
  if (!isBrowserOnline()) return false;
  return Date.now() >= forcedOfflineUntil;
}

/** True while markUnreachable() cooldown is active (API may still be up). */
export function isApiCooldownActive() {
  return isBrowserOnline() && Date.now() < forcedOfflineUntil;
}

export const POS_CONNECTIVITY_EVENT = "pos-connectivity";

function emitConnectivity(online: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(POS_CONNECTIVITY_EVENT, {
      detail: {
        online,
        /** Distinguishes browser offline from circuit-breaker cooldown. */
        forced: !online && isBrowserOnline(),
      },
    }),
  );
}

/** Call after a successful API response. */
export function markReachable() {
  const wasForced = forcedOfflineUntil > Date.now();
  consecutiveFailures = 0;
  forcedOfflineUntil = 0;
  if (wasForced) emitConnectivity(true);
}

/**
 * Call after timeout / network failure.
 * Escalates cooldown so flaky links stop thrashing the main thread.
 */
export function markUnreachable() {
  consecutiveFailures += 1;
  const multiplier = Math.min(consecutiveFailures, 4);
  forcedOfflineUntil = Date.now() + UNREACHABLE_COOLDOWN_MS * multiplier;
  emitConnectivity(false);
}

/** Force local-only mode immediately (e.g. offline event). */
export function forceOfflineNow() {
  forcedOfflineUntil = Date.now() + UNREACHABLE_COOLDOWN_MS;
  emitConnectivity(false);
}

export function clearForcedOffline() {
  forcedOfflineUntil = 0;
  consecutiveFailures = 0;
  emitConnectivity(true);
}

/**
 * Use a longer fetch timeout for bulk catch-up (manual Sync / reconnect).
 * Pair with {@link endExtendedSyncTimeout} in a finally block.
 */
export function beginExtendedSyncTimeout(ms = EXTENDED_SYNC_TIMEOUT_MS) {
  syncTimeoutOverrideMs = Math.max(8_000, ms);
}

export function endExtendedSyncTimeout() {
  syncTimeoutOverrideMs = null;
}

/** Shorter timeouts while we are already in a failure streak. */
export function apiTimeoutMs() {
  if (syncTimeoutOverrideMs != null) return syncTimeoutOverrideMs;
  if (!isBrowserOnline()) return 2_000;
  if (consecutiveFailures >= 2) return 3_000;
  if (consecutiveFailures === 1) return 5_000;
  return 8_000;
}

export function isNetworkError(err: unknown) {
  if (!err || typeof err !== "object") return false;
  if ("status" in err && (err as { status?: number }).status === 0) {
    return true;
  }
  if (err instanceof Error) {
    return /network|failed to fetch|unavailable|timed out|timeout/i.test(
      err.message,
    );
  }
  return false;
}

function errorStatus(err: unknown): number | null {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}

/** Errors that should queue writes instead of failing the cashier. */
export function isQueueableError(err: unknown) {
  if (isNetworkError(err) || !isOnline()) return true;
  const status = errorStatus(err);
  return status != null && [0, 408, 429, 502, 503, 504].includes(status);
}

/** Client validation failures — do not keep retrying forever.
 *  404 is NOT permanent (COMPLETE against a client UUID before CREATE lands).
 *  401/429 are auth/rate-limit — retry after login/backoff, don't dead-letter.
 */
export function isPermanentSyncError(err: unknown) {
  const status = errorStatus(err);
  if (status == null) return false;
  return status === 400 || status === 403 || status === 422;
}

/** Network / host-sick errors must not burn the 8-attempt dead-letter budget. */
export function shouldCountSyncAttempt(err: unknown) {
  if (isNetworkError(err) || isQueueableError(err)) return false;
  const status = errorStatus(err);
  if (status === 401) return false;
  return true;
}

/** Wire browser online/offline once (safe to call multiple times). */
let listenersBound = false;
export function bindConnectivityListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  window.addEventListener("offline", () => {
    forceOfflineNow();
  });
  window.addEventListener("online", () => {
    clearForcedOffline();
  });
}
