import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WAIVER_TRACKER_SMS,
  TRACKER_SMS_DELAY_MS,
  resolveWaiverTrackerSms,
  scheduleWaiverTrackerSms,
} from "./waiver-tracker-sms.js";

describe("resolveWaiverTrackerSms", () => {
  it("uses the default copy when the env var is unset", () => {
    assert.equal(resolveWaiverTrackerSms({}), DEFAULT_WAIVER_TRACKER_SMS);
  });

  it("treats an empty string as a kill switch", () => {
    assert.equal(resolveWaiverTrackerSms({ WAIVER_TRACKER_SMS: "" }), "");
  });

  it("uses a custom message when the env var is set", () => {
    assert.equal(
      resolveWaiverTrackerSms({ WAIVER_TRACKER_SMS: "Catch the trolley: https://example.com" }),
      "Catch the trolley: https://example.com"
    );
  });
});

describe("scheduleWaiverTrackerSms", () => {
  it("does not schedule when WAIVER_TRACKER_SMS is empty", () => {
    const calls = [];
    const result = scheduleWaiverTrackerSms({
      contactId: "c1",
      sendSms: () => calls.push("sent"),
      env: { WAIVER_TRACKER_SMS: "" },
      setTimeoutFn: () => {
        throw new Error("setTimeout should not run");
      },
      log: { log() {}, error() {} },
    });
    assert.deepEqual(result, { scheduled: false, skipped: true, reason: "empty" });
    assert.equal(calls.length, 0);
  });

  it("does not schedule without a contactId", () => {
    const result = scheduleWaiverTrackerSms({
      contactId: null,
      sendSms: async () => ({ ok: true }),
      env: {},
      setTimeoutFn: () => {
        throw new Error("setTimeout should not run");
      },
      log: { log() {}, error() {} },
    });
    assert.deepEqual(result, { scheduled: false, skipped: true, reason: "missing contactId" });
  });

  it("schedules one send after 5 seconds with the default body", async () => {
    let delay;
    let tick;
    const sends = [];
    const result = scheduleWaiverTrackerSms({
      contactId: "c42",
      sendSms: async (id, message) => {
        sends.push({ id, message });
        return { ok: true };
      },
      env: {},
      setTimeoutFn: (fn, ms) => {
        delay = ms;
        tick = fn;
        return 1;
      },
      log: { log() {}, error() {} },
    });

    assert.equal(result.scheduled, true);
    assert.equal(delay, TRACKER_SMS_DELAY_MS);
    assert.equal(TRACKER_SMS_DELAY_MS, 5000);
    assert.equal(sends.length, 0);

    await tick();
    assert.deepEqual(sends, [{ id: "c42", message: DEFAULT_WAIVER_TRACKER_SMS }]);
  });

  it("never throws when the delayed send fails", async () => {
    const errors = [];
    let tick;
    scheduleWaiverTrackerSms({
      contactId: "c9",
      sendSms: async () => {
        throw new Error("ghl down");
      },
      env: { WAIVER_TRACKER_SMS: "hi" },
      setTimeoutFn: (fn) => {
        tick = fn;
        return 1;
      },
      log: {
        log() {},
        error: (...args) => errors.push(args.join(" ")),
      },
    });

    await tick();
    assert.match(errors.join("\n"), /waiver tracker SMS error/);
  });
});
