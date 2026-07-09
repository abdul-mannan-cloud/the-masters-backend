import Customer from "../Models/Customer.js";
import Tenant from "../Models/Tenant.js";
import { getNextSequence } from "./counter.js";

const CUSTOMER_NUMBER_PREFIX = "cust";

// Boot-time migration: assigns a customerNumber to any customer created before
// this field existed. Processed oldest-first per tenant so numbering reads as
// chronological (cust0001 is that tenant's first-ever customer). Idempotent —
// only touches customers where customerNumber is missing.
export const backfillCustomerNumbers = async () => {
  const tenants = await Tenant.find({ isDeleted: false });

  for (const tenant of tenants) {
    const unnumbered = await Customer.find({
      tenantId: tenant._id,
      customerNumber: { $in: [null, undefined] },
    }).sort({ createdAt: 1 });

    for (const customer of unnumbered) {
      const seq = await getNextSequence(tenant._id, "customer");
      customer.customerNumber = `${CUSTOMER_NUMBER_PREFIX}${String(seq).padStart(4, "0")}`;
      await customer.save();
    }
  }
};
