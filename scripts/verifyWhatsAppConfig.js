// Backend-only, read-only verification of the Meta WhatsApp Cloud API
// configuration in .env. Run with: node scripts/verifyWhatsAppConfig.js
//
// Deliberately does NOT send any WhatsApp message — this only confirms the
// credentials are valid and reachable, and reports which message templates
// (if any) exist on the WhatsApp Business Account. Sending a real message
// requires a recipient already registered in Meta's test-number allow-list
// (App Dashboard > WhatsApp > API Setup), which this script has no way to
// discover — that's a separate, explicit, one-recipient-at-a-time action,
// never something bulk/automatic like this check.
//
// Never logs WHATSAPP_ACCESS_TOKEN itself, in success or failure output.
import dotenv from "dotenv";
dotenv.config();

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";
// Only this script uses WHATSAPP_BUSINESS_ACCOUNT_ID — the actual send path
// (utils/whatsappClient.js) never reads it, since sending only needs the
// phone number ID + token. It's used here purely to list templates.
const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

const graphUrl = (path) => `https://graph.facebook.com/${apiVersion}/${path}`;

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};

const ok = (msg) => console.log(`✓ ${msg}`);

async function main() {
  console.log("=== WhatsApp Cloud API configuration check ===\n");

  console.log("Step 1: environment variables");
  if (!phoneNumberId) fail("WHATSAPP_PHONE_NUMBER_ID is missing");
  else ok("WHATSAPP_PHONE_NUMBER_ID is set");
  if (!accessToken) fail("WHATSAPP_ACCESS_TOKEN is missing");
  else ok("WHATSAPP_ACCESS_TOKEN is set");
  ok(`WHATSAPP_API_VERSION = ${apiVersion}${process.env.WHATSAPP_API_VERSION ? "" : " (default, not set in .env)"}`);
  if (!wabaId) {
    console.log("  (WHATSAPP_BUSINESS_ACCOUNT_ID not set — template listing in Step 3 will be skipped; not required for sending)");
  }

  if (!phoneNumberId || !accessToken) {
    console.log("\nCannot continue — fix the missing variable(s) above.");
    return;
  }

  console.log("\nStep 2: phone number + access token accepted by Meta");
  try {
    const res = await fetch(
      graphUrl(`${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`),
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json();
    if (!res.ok) {
      fail(`Meta rejected the request: ${data?.error?.message || `HTTP ${res.status}`}`);
    } else {
      ok(`Token + Phone Number ID valid — sending number: ${data.display_phone_number} (${data.verified_name})`);
      console.log(`  quality_rating: ${data.quality_rating}, code_verification_status: ${data.code_verification_status}`);
    }
  } catch (err) {
    fail(`Network error reaching Meta: ${err.message}`);
    return;
  }

  if (!wabaId) return;

  console.log("\nStep 3: message templates on this WhatsApp Business Account");
  try {
    const res = await fetch(graphUrl(`${wabaId}/message_templates?limit=50`), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      fail(`Could not list templates: ${data?.error?.message || `HTTP ${res.status}`}`);
      return;
    }
    const templates = data.data || [];
    if (templates.length === 0) {
      console.log("  No templates found on this WABA.");
    } else {
      ok(`${templates.length} template(s) found:`);
      for (const t of templates) {
        console.log(`  - ${t.name} [${t.status}] (${t.category}, ${t.language})`);
      }
    }
    console.log(
      "\n  NOTE: this only reports what exists on Meta's side — it does not check\n" +
        "  whether any of these are appropriate for this app's order-placed/\n" +
        "  order-completed/payment-received content. See the audit report for that.",
    );
  } catch (err) {
    fail(`Network error listing templates: ${err.message}`);
  }
}

main();
