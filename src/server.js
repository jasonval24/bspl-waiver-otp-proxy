import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;
const VERIFY_SERVICE_SID =
  process.env.VERIFY_SERVICE_SID || "VAd61aecbc4e7e19ebf88d398ccc0a7f0d";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const GHL_TOKEN = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || "SR6TyBbdGg6FF6mVEJX4";
const WAIVER_ACK_TAG = process.env.WAIVER_ACK_TAG || "waiver-ack";

const ALLOWED = (
  process.env.ALLOWED_ORIGINS ||
  "https://jasonval24.github.io,https://bluepedallounge.com,https://www.bluepedallounge.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || ALLOWED.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json({ limit: "32kb" }));

const sendBuckets = new Map();

function normalizeUsE164(phone) {
  if (typeof phone !== "string") return null;
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, "");
  let e164;
  if (raw.startsWith("+") && digits.length === 11 && digits.startsWith("1")) e164 = "+" + digits;
  else if (digits.length === 10) e164 = "+1" + digits;
  else if (digits.length === 11 && digits.startsWith("1")) e164 = "+" + digits;
  else return null;
  const n = e164.slice(2);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(n)) return null;
  return e164;
}

function rateLimitSend(phone) {
  const now = Date.now();
  let b = sendBuckets.get(phone);
  if (!b) {
    b = { last: 0, hourStart: now, hourCount: 0 };
    sendBuckets.set(phone, b);
  }
  if (now - b.hourStart > 3600_000) {
    b.hourStart = now;
    b.hourCount = 0;
  }
  if (now - b.last < 30_000) return "Please wait 30 seconds before requesting another code.";
  if (b.hourCount >= 5) return "Too many codes for this number. Try again in an hour.";
  b.last = now;
  b.hourCount += 1;
  return null;
}

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "Guest", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "." };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function twilioForm(path, fields) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    const err = new Error("Server misconfigured");
    err.status = 500;
    throw err;
  }
  const body = new URLSearchParams(fields);
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${VERIFY_SERVICE_SID}${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );
  let data = {};
  try {
    data = await res.json();
  } catch (_) {}
  return { ok: res.ok, status: res.status, data };
}

async function upsertGhlContact({ fullName, phone }) {
  if (!GHL_TOKEN) {
    const err = new Error("CRM not configured");
    err.status = 500;
    throw err;
  }
  const { firstName, lastName } = splitName(fullName);
  const nowIso = new Date().toISOString();
  const payload = {
    locationId: GHL_LOCATION_ID,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
    phone,
    source: "Quick Waiver",
    tags: [WAIVER_ACK_TAG],
  };
  // Prefer upsert
  let res = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GHL_TOKEN}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 BSPL-Waiver-OTP/1.0",
    },
    body: JSON.stringify(payload),
  });
  let data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // fallback create
    res = await fetch("https://services.leadconnectorhq.com/contacts/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GHL_TOKEN}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 BSPL-Waiver-OTP/1.0",
      },
      body: JSON.stringify(payload),
    });
    data = await res.json().catch(() => ({}));
  }
  if (!res.ok) {
    const err = new Error("Could not save waiver contact");
    err.status = 502;
    err.detail = data;
    throw err;
  }
  // Best-effort note
  const contactId = data?.contact?.id || data?.id;
  if (contactId) {
    try {
      await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/notes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GHL_TOKEN}`,
          Version: "2021-07-28",
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 BSPL-Waiver-OTP/1.0",
        },
        body: JSON.stringify({
          body: `Quick Waiver submission ${nowIso} (America/Chicago). Source: temp/OTP page. Version board-ack-v1.`,
        }),
      });
    } catch (_) {}
  }
  return { contactId, raw: data };
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    twilio: Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN),
    ghl: Boolean(GHL_TOKEN),
    verifyService: VERIFY_SERVICE_SID,
  });
});

app.post("/send", async (req, res) => {
  try {
    const phone = normalizeUsE164(req.body?.phone);
    if (!phone) return res.status(400).json({ status: "error", message: "Enter a valid US mobile number." });
    const rl = rateLimitSend(phone);
    if (rl) return res.status(429).json({ status: "error", message: rl });
    const tw = await twilioForm("/Verifications", { To: phone, Channel: "sms" });
    if (!tw.ok) {
      return res.status(502).json({
        status: "error",
        message:
          tw.status === 429
            ? "Too many requests. Try again shortly."
            : "Could not send the code. Check the number and try again.",
      });
    }
    return res.json({ status: "sent", expiresInSeconds: 300 });
  } catch (e) {
    return res.status(e.status || 500).json({ status: "error", message: e.message || "Server error" });
  }
});

app.post("/check", async (req, res) => {
  try {
    const phone = normalizeUsE164(req.body?.phone);
    const code = String(req.body?.code || "").trim();
    const fullName = String(req.body?.fullName || req.body?.name || "").trim();
    if (!phone) return res.status(400).json({ status: "error", message: "Enter a valid US mobile number." });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ status: "error", message: "Enter the 6-digit code." });
    if (!fullName) return res.status(400).json({ status: "error", message: "Name is required." });

    const tw = await twilioForm("/VerificationCheck", { To: phone, Code: code });
    const status = tw.data?.status || "";
    if (status === "approved") {
      const ghl = await upsertGhlContact({ fullName, phone });
      return res.json({ status: "approved", contactId: ghl.contactId || null });
    }
    if (tw.ok || status === "pending" || status === "canceled") {
      return res.json({ status: "pending" });
    }
    return res.status(400).json({
      status: "error",
      message:
        tw.status === 404 || status === "expired"
          ? "That code expired. Request a new one."
          : "Could not verify the code. Try again.",
    });
  } catch (e) {
    return res.status(e.status || 500).json({ status: "error", message: e.message || "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`bspl-waiver-otp listening on ${PORT}`);
});
