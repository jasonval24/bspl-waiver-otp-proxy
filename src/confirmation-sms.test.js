import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldSkipConfirmationSms } from "./confirmation-sms.js";

describe("shouldSkipConfirmationSms", () => {
  it("keeps both texts when the body has no opt-out (Vibe default)", () => {
    assert.equal(shouldSkipConfirmationSms({}), false);
    assert.equal(
      shouldSkipConfirmationSms({
        phone: "+13615550142",
        code: "123456",
        fullName: "Jason V",
      }),
      false
    );
    assert.equal(shouldSkipConfirmationSms(undefined), false);
    assert.equal(shouldSkipConfirmationSms(null), false);
  });

  it("skips both texts when skipConfirmationSms is true", () => {
    assert.equal(shouldSkipConfirmationSms({ skipConfirmationSms: true }), true);
    assert.equal(shouldSkipConfirmationSms({ skipConfirmationSms: "true" }), true);
  });

  it("skips both texts when source is find-checkout", () => {
    assert.equal(shouldSkipConfirmationSms({ source: "find-checkout" }), true);
  });

  it("does not skip on other source values or a false flag", () => {
    assert.equal(shouldSkipConfirmationSms({ source: "vibe" }), false);
    assert.equal(shouldSkipConfirmationSms({ skipConfirmationSms: false }), false);
    assert.equal(shouldSkipConfirmationSms({ skipConfirmationSms: "false" }), false);
  });
});
