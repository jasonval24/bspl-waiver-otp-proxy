# BSPL Waiver OTP proxy

Secure Twilio Verify + GoHighLevel upsert for Blue Shore Pedal Lounge Quick Waiver.

- `POST /send` `{ "phone": "+1..." }`
- `POST /check` `{ "phone": "+1...", "code": "123456", "fullName": "..." }` — on approved, upserts GHL contact with tag `waiver-ack`
- Secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `GHL_PRIVATE_INTEGRATION_TOKEN`
