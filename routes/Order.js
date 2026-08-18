import { Router } from "express";
import {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
  getBill,
  getCheckout,
  getOrderDetails,
  applyDiscount,
  confirmOrder,
} from "../Controllers/orderController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

router.get("/", authentication(), authorize("orders", "view"), getAllOrders);
router.get("/:id", authentication(), authorize("orders", "view"), getOrderById);
router.get("/:id/bill", authentication(), authorize("orders", "view"), getBill);
router.get("/:id/checkout", authentication(), authorize("orders", "view"), getCheckout);
router.get("/:id/details", authentication(), authorize("orders", "view"), getOrderDetails);
router.post("/", authentication("tenant_admin", "manager", "employee"), authorize("orders", "create"), createOrder);
router.put("/:id", authentication("tenant_admin", "manager", "employee"), authorize("orders", "update"), updateOrder);
router.patch(
  "/:id/discount",
  authentication("tenant_admin", "manager", "employee"),
  authorize("orders", "update"),
  applyDiscount,
);
router.patch(
  "/:id/confirm",
  authentication("tenant_admin", "manager", "employee"),
  authorize("orders", "update"),
  confirmOrder,
);
// Order deletion cascades to OrderItems/Assignments/Payments — kept tenant_admin-only
// regardless of Role permissions, same intentionally stricter policy as before this feature.
router.delete("/:id", authentication("tenant_admin"), authorize("orders", "delete"), deleteOrder);

<<<<<<< HEAD
export default router;
=======
// Get today's orders
router.get('/today/orders', orderController.getOrdersToday);

// Place order
router.post('/placeorder', orderController.placeOrder);

// Update order status
router.put('/update/status/:id', orderController.updateStatus);

// Update payment status
router.put('/update/payment/:id', orderController.updatePaymentStatus);

// Get order statistics
router.get('/stats/overview', orderController.getOrderStats);

// Delete order
router.delete('/delete/:id', orderController.deleteOrder);

// Send "ready for pickup" WhatsApp message for an order
router.post('/:id/notify-whatsapp-ready', orderController.sendReadyWhatsAppMessage);

// Send "order_update" WhatsApp template message (used when order is completed)
router.post('/:id/notify-whatsapp-update', orderController.sendOrderUpdateWhatsApp);

// Bulk-send "order_update" WhatsApp template to multiple customers
router.post('/bulk/notify-whatsapp-update', orderController.bulkSendOrderUpdateWhatsApp);

// Get single order
router.get('/:id', orderController.getOrderById);

module.exports = router;
>>>>>>> bc4332ff63ff85ba9ee992c42e86638f4a6609d0
