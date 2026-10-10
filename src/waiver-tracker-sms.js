export const DEFAULT_WAIVER_TRACKER_SMS =
  "Thanks for signing! Use our new trolley tracker to see where we are and catch your ride: https://bluepedallounge.com/find";

export const TRACKER_SMS_DELAY_MS = 5000;

const pendingTimers = new Set();

/**
 * Resolve the follow-up tracker SMS body.
 * Unset env → default copy. Empty string → kill switch (skip send).
 */
export function resolveWaiverTrackerSms(env = process.env) {
  if (!Object.prototype.hasOwnProperty.call(env, "WAIVER_TRACKER_SMS")) {
    return DEFAULT_WAIVER_TRACKER_SMS;
  }
  return env.WAIVER_TRACKER_SMS;
}

/**
 * Schedule one GHL Conversations SMS ~5s later without blocking the caller.
 * Timers are held in-process so the send still fires after the HTTP handler
 * returns on a long-running Node runtime (Render web service).
 */
export function scheduleWaiverTrackerSms({
  contactId,
  sendSms,
  delayMs = TRACKER_SMS_DELAY_MS,
  env = process.env,
  setTimeoutFn = setTimeout,
  log = console,
} = {}) {
  const message = resolveWaiverTrackerSms(env);
  if (message === "") {
    log.log("waiver tracker SMS skipped (WAIVER_TRACKER_SMS empty)");
    return { scheduled: false, skipped: true, reason: "empty" };
  }
  if (!contactId) {
    log.log("waiver tracker SMS skipped (missing contactId)");
    return { scheduled: false, skipped: true, reason: "missing contactId" };
  }
  if (typeof sendSms !== "function") {
    log.error("waiver tracker SMS skipped (sendSms not provided)");
    return { scheduled: false, skipped: true, reason: "missing sendSms" };
  }

  const timer = setTimeoutFn(() => {
    pendingTimers.delete(timer);
    return Promise.resolve()
      .then(() => sendSms(contactId, message))
      .then((result) => {
        if (result && result.ok === false) {
          log.error(
            "waiver tracker SMS failed",
            result.status || "",
            result.error || result.reason || ""
          );
        }
      })
      .catch((e) => {
        log.error("waiver tracker SMS error", e?.message || e);
      });
  }, delayMs);

  pendingTimers.add(timer);
  return { scheduled: true, skipped: false, message, delayMs, timer };
}
