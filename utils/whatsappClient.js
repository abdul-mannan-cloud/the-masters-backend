// Thin wrapper around Meta's WhatsApp Cloud API (Graph API "messages"
// endpoint).
//
// IMPORTANT — Meta only allows free-form "text" messages (what this sends)
// within 24 hours of the customer's last message to the business ("session
// messaging"). A proactive, business-initiated notification like "order
// placed" outside that window requires a pre-approved Message Template
// (fixed structure, submitted to Meta for review, numbered {{1}}/{{2}}
// placeholders — incompatible with fully tenant-customizable free text).
// This app has no approved template yet, so sends outside the 24h window
// will be rejected by Meta with an error — that failure is caught by the
// caller and recorded on the Notification (status "failed"), never thrown
// back into the order-creation flow.

const PLATFORM_DEFAULT_API_VERSION = "v21.0";
// Warn at most once per boot, not once per send, if a tenant falls back to
// the shared dev credentials — noisy but not log-spam.
const warnedFallbackTenants = new Set();

// The ONE seam every send goes through to find out which Meta credentials to
// use for a given tenant — each tenant now connects its OWN WhatsApp
// Business account (Settings.whatsapp, see Models/Settings.js), resolved
// here instead of reading process.env. A tenant with nothing configured
// gets a clear "not configured" failure in production; outside production
// only, it falls back to the shared .env test account so local development
// keeps working without every developer configuring a real Meta account —
// see .env's comment on WHATSAPP_* for why those are dev-only now.
export const getWhatsAppCredentials = async (tenantId) => {
  // Deferred import avoids a load-order cycle: SettingsService doesn't
  // import this module, but keeping the dependency lazy here means this
  // client file has no hard compile-time dependency on the service layer,
  // matching "the client should remain responsible only for communication
  // with Meta" (Services/WhatsAppNotificationService.js already imports
  // SettingsService directly for everything else).
  const { getTenantWhatsAppCredentials } = await import("../Services/SettingsService.js");
  const tenantCreds = await getTenantWhatsAppCredentials(tenantId);

  if (tenantCreds?.enabled === false) {
    return { enabled: false, phoneNumberId: null, accessToken: null, apiVersion: PLATFORM_DEFAULT_API_VERSION };
  }

  if (tenantCreds?.phoneNumberId && tenantCreds?.accessToken) {
    return {
      enabled: true,
      phoneNumberId: tenantCreds.phoneNumberId,
      accessToken: tenantCreds.accessToken,
      apiVersion: tenantCreds.apiVersion || PLATFORM_DEFAULT_API_VERSION,
    };
  }

  if (process.env.NODE_ENV !== "production") {
    if (!warnedFallbackTenants.has(String(tenantId))) {
      warnedFallbackTenants.add(String(tenantId));
      console.warn(
        `[whatsapp] Tenant ${tenantId} has no WhatsApp credentials configured — falling back to the shared .env test account (dev-only; this fallback never applies when NODE_ENV=production).`,
      );
    }
    return {
      enabled: true,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      apiVersion: process.env.WHATSAPP_API_VERSION || PLATFORM_DEFAULT_API_VERSION,
    };
  }

  return { enabled: true, phoneNumberId: null, accessToken: null, apiVersion: PLATFORM_DEFAULT_API_VERSION };
};

const graphApiUrl = ({ apiVersion, phoneNumberId }) =>
  `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

// Customers are stored as raw Pakistani-mobile digits ("03XXXXXXXXX", see
// utils/validators.js) — WhatsApp's Cloud API needs E.164-ish digits with
// the country code and no leading 0 ("92XXXXXXXXX").
export const formatPhoneForWhatsApp = (digits) => `92${digits.slice(1)}`;

export const sendWhatsAppTextMessage = async (toDigits, body, tenantId) => {
  const { enabled, phoneNumberId, accessToken, apiVersion } = await getWhatsAppCredentials(tenantId);
  if (!enabled) {
    throw new Error("WhatsApp is disabled for this business");
  }
  if (!phoneNumberId || !accessToken) {
    throw new Error("This business's WhatsApp configuration is incomplete");
  }

  const res = await fetch(graphApiUrl({ apiVersion, phoneNumberId }), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: formatPhoneForWhatsApp(toDigits),
      type: "text",
      text: { body },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `WhatsApp API responded with ${res.status}`;
    throw new Error(message);
  }

  return { messageId: data?.messages?.[0]?.id || null };
};

// Kept alongside the text-sending path above for when a tenant's message has
// been registered with Meta as an approved template (see the module comment)
// — not called anywhere yet, since no template exists for this app's actual
// order content, but the shape is real so wiring it in later is a one-line
// change at the call site, not a rewrite.
export const sendWhatsAppTemplateMessage = async (
  toDigits,
  templateName,
  languageCode,
  bodyParams = [],
  tenantId,
) => {
  const { enabled, phoneNumberId, accessToken, apiVersion } = await getWhatsAppCredentials(tenantId);
  if (!enabled) {
    throw new Error("WhatsApp is disabled for this business");
  }
  if (!phoneNumberId || !accessToken) {
    throw new Error("This business's WhatsApp configuration is incomplete");
  }

  const res = await fetch(graphApiUrl({ apiVersion, phoneNumberId }), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: formatPhoneForWhatsApp(toDigits),
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: bodyParams.length
          ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text: String(text) })) }]
          : [],
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `WhatsApp API responded with ${res.status}`;
    throw new Error(message);
  }

  return { messageId: data?.messages?.[0]?.id || null };
};
