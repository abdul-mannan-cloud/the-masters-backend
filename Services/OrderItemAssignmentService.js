import mongoose from "mongoose";
import OrderItemAssignment from "../Models/OrderItemAssignment.js";
import OrderItem from "../Models/OrderItem.js";
import Order from "../Models/Order.js";
import ProductType from "../Models/ProductType.js";
import Employee from "../Models/Employee.js";
import AppError from "../utils/AppError.js";

const VALID_STATUSES = ["pending", "in_progress", "completed", "reassigned"];
// Forward-only — an employee self-reporting progress on their own step can
// advance it but never jump backward or mark it "reassigned" (an owner/
// manager-only concern handled through the general update path instead).
const SELF_SERVICE_STATUS_ORDER = ["pending", "in_progress", "completed"];

export const listOrderItemAssignments = async (tenantId, orderItemId, employeeId) => {
  const filter = { tenantId };
  if (orderItemId) filter.orderItemId = orderItemId;
  if (employeeId) filter.employeeId = employeeId;
  return OrderItemAssignment.find(filter).sort({ createdAt: -1 });
};

export const getOrderItemAssignmentById = async (tenantId, id) => {
  const assignment = await OrderItemAssignment.findOne({ _id: id, tenantId });
  if (!assignment) throw new AppError("Order item assignment not found", 404);
  return assignment;
};

export const createOrderItemAssignment = async (tenantId, data, userId, session) => {
  const { orderItemId, employeeId, sequence, notes } = data;

  if (!orderItemId || !employeeId || sequence === undefined) {
    throw new AppError("orderItemId, employeeId, and sequence are required", 400);
  }

  const orderItem = await OrderItem.findOne({ _id: orderItemId, tenantId }).session(
    session ?? null,
  );
  if (!orderItem) throw new AppError("Order item not found for this tenant", 404);

  const productType = await ProductType.findOne({
    _id: orderItem.productTypeId,
    tenantId,
  }).session(session ?? null);
  if (!productType) throw new AppError("Product type not found for this tenant", 404);

  const workflowStep = productType.workflow.find((step) => step.sequence === sequence);
  if (!workflowStep) {
    throw new AppError(`No workflow step with sequence ${sequence} on this product type`, 400);
  }

  // Employee ownership is re-verified here (not trusted from the caller)
  // even though bulkAssignEmployees below already resolves employees from a
  // tenant-scoped query — this function is also called directly via
  // POST /order-item-assignment, so it must stand on its own.
  const employee = await Employee.findOne({
    _id: employeeId,
    tenantId,
    isDeleted: false,
  }).session(session ?? null);
  if (!employee) throw new AppError("Employee not found for this tenant", 404);
  if (!employee.skills.includes(workflowStep.requiredSkill)) {
    throw new AppError(
      `Employee does not have the required skill: ${workflowStep.requiredSkill}`,
      400,
    );
  }

  const [assignment] = await OrderItemAssignment.create(
    [
      {
        tenantId,
        orderItemId,
        employeeId,
        workflowStep: {
          sequence: workflowStep.sequence,
          step: workflowStep.step,
          requiredSkill: workflowStep.requiredSkill,
        },
        notes,
        createdBy: userId,
        updatedBy: userId,
      },
    ],
    { session },
  );
  return assignment;
};

// Owner/authorized-employee entry point for "Assign Employees" on an order —
// the ONLY place that both (a) creates OrderItemAssignments for potentially
// several (orderItem, workflowStep, employee) tuples in one request and
// (b) advances the order pending -> in_progress as a direct, atomic
// consequence of a successful assignment (see claude.md section 3 of this
// feature: only pending may auto-advance, completed/delivered/cancelled
// orders are never touched here).
//
// `assignments` is an explicit list of { orderItemId, sequence, employeeId,
// notes? } tuples rather than a flat employeeId list — an order can contain
// multiple OrderItems (multiple products), each with its own workflow, so
// the caller (frontend) resolves which employee fills which item's step
// before calling this; the backend then re-validates every tuple exactly
// the same way the single-assignment endpoint does (tenant + skill match),
// never trusting that the frontend's matching was correct.
export const bulkAssignEmployees = async (tenantId, orderId, assignments, userId) => {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    throw new AppError("assignments must be a non-empty array", 400);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const order = await Order.findOne({ _id: orderId, tenantId }).session(session);
    if (!order) throw new AppError("Order not found", 404);
    if (["completed", "delivered", "cancelled"].includes(order.productionStatus)) {
      throw new AppError(
        `Order is already ${order.productionStatus} — employees can no longer be assigned`,
        409,
      );
    }

    const created = [];
    for (const entry of assignments) {
      const orderItem = await OrderItem.findOne({
        _id: entry.orderItemId,
        tenantId,
        orderId,
      }).session(session);
      if (!orderItem) {
        throw new AppError("Order item not found on this order", 404);
      }
      const assignment = await createOrderItemAssignment(tenantId, entry, userId, session);
      created.push(assignment);
    }

    // Only pending -> in_progress, and only as a direct result of this
    // successful assignment — an order already in_progress (more staff being
    // added later) is left as-is, and completed/delivered/cancelled were
    // already rejected above.
    let statusChanged = false;
    if (order.productionStatus === "pending") {
      order.productionStatus = "in_progress";
      order.updatedBy = userId;
      await order.save({ session });
      statusChanged = true;

      await OrderItem.updateMany(
        { orderId, tenantId, status: "pending" },
        { status: "in_progress", updatedBy: userId },
        { session },
      );
    }

    await session.commitTransaction();
    return { order, assignments: created, statusChanged };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// Self-service: an employee updates the status of THEIR OWN assignment
// (e.g. marking their cutting step "in_progress" then "completed") without
// needing the general orders.update permission — same "self-service,
// ungated by authorize()" pattern as GET /employee/me/permissions. Forward-
// only and ownership-checked; anything else (reassigning, editing someone
// else's step) still goes through updateOrderItemAssignment below, which
// requires orders.update.
export const updateMyAssignmentStatus = async (tenantId, employeeId, id, status, userId) => {
  if (!SELF_SERVICE_STATUS_ORDER.includes(status)) {
    throw new AppError(
      `Invalid status. Must be one of: ${SELF_SERVICE_STATUS_ORDER.join(", ")}`,
      400,
    );
  }

  const assignment = await OrderItemAssignment.findOne({ _id: id, tenantId, employeeId });
  if (!assignment) throw new AppError("Assignment not found for this employee", 404);

  const currentIndex = SELF_SERVICE_STATUS_ORDER.indexOf(assignment.status);
  const nextIndex = SELF_SERVICE_STATUS_ORDER.indexOf(status);
  if (currentIndex === -1 || nextIndex < currentIndex) {
    throw new AppError(`Cannot move this task from "${assignment.status}" to "${status}"`, 400);
  }

  assignment.status = status;
  assignment.completedAt = status === "completed" ? new Date() : assignment.completedAt;
  assignment.updatedBy = userId;
  await assignment.save();
  return assignment;
};

export const updateOrderItemAssignment = async (tenantId, id, data, userId) => {
  const { status, notes } = data;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    throw new AppError(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`, 400);
  }

  const assignment = await OrderItemAssignment.findOne({ _id: id, tenantId });
  if (!assignment) throw new AppError("Order item assignment not found", 404);

  if (status !== undefined) {
    assignment.status = status;
    assignment.completedAt = status === "completed" ? new Date() : assignment.completedAt;
  }
  if (notes !== undefined) assignment.notes = notes;
  assignment.updatedBy = userId;

  await assignment.save();
  return assignment;
};

export const deleteOrderItemAssignment = async (tenantId, id) => {
  const assignment = await OrderItemAssignment.findOneAndDelete({ _id: id, tenantId });
  if (!assignment) throw new AppError("Order item assignment not found", 404);
  return assignment;
};
