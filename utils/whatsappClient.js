// Thin wrapper around Meta's WhatsApp Cloud API (Graph API "messages"
// endpoint). Platform-level credentials — one Meta WhatsApp Business app
// sends on behalf of every tenant; the business's own name/branding comes
// through in the message text (see Services/WhatsAppNotificationService.js),
// not from a per-tenant phone number.
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
//
// Read at call time, not module load, so a `.env` change during local dev
// (server restart) is picked up without reasoning about import order.
const graphApiUrl = () => {
  const version = process.env.WHATSAPP_API_VERSION || "v21.0";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
};

// Customers are stored as raw Pakistani-mobile digits ("03XXXXXXXXX", see
// utils/validators.js) — WhatsApp's Cloud API needs E.164-ish digits with
// the country code and no leading 0 ("92XXXXXXXXX").
export const formatPhoneForWhatsApp = (digits) => `92${digits.slice(1)}`;

export const sendWhatsAppTextMessage = async (toDigits, body) => {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error("WhatsApp is not configured (missing WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN)");
  }

  const res = await fetch(graphApiUrl(), {
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
// — not called anywhere yet, since no template exists, but the shape is real
// so wiring it in later is a one-line change at the call site, not a rewrite.
export const sendWhatsAppTemplateMessage = async (toDigits, templateName, languageCode, bodyParams = []) => {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error("WhatsApp is not configured (missing WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN)");
  }

  const res = await fetch(graphApiUrl(), {
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
