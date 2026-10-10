/**
 * Additive opt-out for the post-/check thank-you SMS and the delayed
 * trolley-tracker SMS. Vibe never sends these fields, so default is
 * unchanged (both texts still go out).
 *
 * Find checkout (booker server-side /check) passes skipConfirmationSms
 * and/or source: "find-checkout" so riders get only the post-pay ticket SMS.
 */
export function shouldSkipConfirmationSms(body) {
  if (!body || typeof body !== "object") return false;
  if (body.skipConfirmationSms === true || body.skipConfirmationSms === "true") {
    return true;
  }
  if (body.source === "find-checkout") return true;
  return false;
}
