# BSPL Waiver OTP proxy

Secure Twilio Verify + GoHighLevel upsert for Blue Shore Pedal Lounge Quick Waiver.

- `POST /send` `{ "phone": "+1..." }`
- `POST /check` `{ "phone": "+1...", "code": "123456", "fullName": "..." }` — on approved, upserts GHL contact with tag `waiver-ack`, then sends the confirmation SMS via GHL Conversations (361-600-8508)
- Optional Find-checkout opt-out on `/check` only: `{ "skipConfirmationSms": true }` or `{ "source": "find-checkout" }` skips both the thank-you SMS and the delayed trolley-tracker SMS. Vibe does not send these fields, so default behavior is unchanged. GHL waiver-ack upsert still runs.
- Secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `GHL_PRIVATE_INTEGRATION_TOKEN`

## Follow-up trolley tracker SMS

After a successful confirmation SMS, the proxy schedules one extra SMS about 5 seconds later on the same GHL Conversations path (same BSPL 361-600-8508 sender). The HTTP `/check` response is not held open for that delay.

- `WAIVER_TRACKER_SMS` — body of the extra SMS. When unset, defaults to: `Thanks for signing! Use our new trolley tracker to see where we are and catch your ride: https://bluepedallounge.com/find`
- Set `WAIVER_TRACKER_SMS` to an empty string to skip the extra SMS (kill switch).
- The extra SMS is sent on every successful waiver, including repeat riders. It is skipped if the waiver fails or the confirmation SMS does not send. Errors in the extra send are logged and never fail the waiver.
