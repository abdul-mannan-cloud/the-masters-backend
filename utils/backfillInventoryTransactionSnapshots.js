import InventoryTransaction from "../Models/InventoryTransaction.js";
import Order from "../Models/Order.js";
import Customer from "../Models/Customer.js";
import OrderItem from "../Models/OrderItem.js";
import { resolvePerformedByName } from "../Services/InventoryService.js";

// Boot-time migration: fills in the orderNumber/customerName/productName/
// performedByName snapshot fields (added to InventoryTransaction after live
// data already existed) for any pre-existing transaction still missing them.
// Idempotent — only touches rows where at least one of these fields is null.
export const backfillInventoryTransactionSnapshots = async () => {
  const stale = await InventoryTransaction.find({
    $or: [
      { performedByName: null },
      { orderId: { $ne: null }, orderNumber: null },
      { orderId: { $ne: null }, customerName: null },
      { orderItemId: { $ne: null }, productName: null },
    ],
  });

  for (const tx of stale) {
    let changed = false;

    if (!tx.performedByName && tx.createdBy) {
      const name = await resolvePerformedByName(tx.createdBy);
      if (name) {
        tx.performedByName = name;
        changed = true;
      }
    }

    if (tx.orderId && (!tx.orderNumber || !tx.customerName)) {
      const order = await Order.findById(tx.orderId);
      if (order) {
        if (!tx.orderNumber) {
          tx.orderNumber = order.orderNumber;
          changed = true;
        }
        if (!tx.customerName) {
          const customer = await Customer.findById(order.customerId);
          if (customer) {
            tx.customerName = customer.name;
            changed = true;
          }
        }
      }
    }

    if (tx.orderItemId && !tx.productName) {
      const orderItem = await OrderItem.findById(tx.orderItemId);
      if (orderItem) {
        tx.productName = orderItem.garmentType;
        changed = true;
      }
    }

    if (changed) await tx.save();
  }
};
