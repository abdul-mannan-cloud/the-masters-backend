// Placeholders every WhatsApp template may reference — shown to the tenant
// as a legend in Business Settings and used to validate nothing else is
// silently no-op'd. Unknown {{tokens}} in a template are left as literal
// text by renderWhatsAppTemplate rather than erroring, since a business
// editing free text shouldn't get a 500 for a typo.
export const WHATSAPP_PLACEHOLDERS = [
  { key: "customerName", description: "Customer's name" },
  { key: "businessName", description: "Business name" },
  { key: "orderNumber", description: "Order number, e.g. cust0001-1" },
  { key: "orderDate", description: "Date the order was placed" },
  { key: "items", description: "List of ordered garments, one per line" },
  { key: "subtotal", description: "Subtotal before discount (Rs.)" },
  { key: "discount", description: "Discount amount actually applied (Rs.)" },
  { key: "grandTotal", description: "Order total after discount (Rs.)" },
  { key: "amountPaid", description: "Amount paid so far (Rs.)" },
  { key: "remainingAmount", description: "Remaining balance (Rs.)" },
  { key: "paymentStatus", description: "Unpaid / Partial / Paid" },
  { key: "businessPhone", description: "Business contact number" },
  { key: "businessAddress", description: "Business address" },
];

export const DEFAULT_ORDER_PLACED_TEMPLATE = `Hello {{customerName}},

Your order has been successfully placed with {{businessName}}.

Order: #{{orderNumber}}

Items:
{{items}}

Subtotal: Rs. {{subtotal}}
Discount: Rs. {{discount}}
Grand Total: Rs. {{grandTotal}}

Paid: Rs. {{amountPaid}}
Remaining: Rs. {{remainingAmount}}

Thank you for choosing {{businessName}}.`;

export const DEFAULT_ORDER_COMPLETED_TEMPLATE = `Hello {{customerName}},

Your order #{{orderNumber}} is now ready for collection.

You can collect your order from:

{{businessName}}
{{businessAddress}}

Please contact us if you have any questions: {{businessPhone}}

Thank you.`;

// {{key}} substitution — a token with no matching data key is left as-is
// rather than replaced with "undefined", so a stray/misspelled placeholder
// in a business's custom template degrades gracefully instead of corrupting
// the rest of the message.
export const renderWhatsAppTemplate = (template, data) =>
  template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(data, key) ? String(data[key]) : match,
  );

// "- Men's Kameez × 1" per line — the {{items}} placeholder's value.
export const formatItemsList = (items) =>
  items.map((item) => `- ${item.garmentType} × ${item.quantity}`).join("\n");

export const formatMoney = (amount) => Number(amount || 0).toLocaleString("en-US");

export const formatPaymentStatusLabel = (status) => {
  const labels = { unpaid: "Unpaid", partial: "Partial", paid: "Paid" };
  return labels[status] || status;
};
