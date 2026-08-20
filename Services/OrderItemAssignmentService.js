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
  // even though syncOrderAssignments below already resolves employees from a
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

// Shared by syncOrderAssignments below — only pending -> in_progress, and
// only as a direct result of a successful assignment (claude.md section 3/4
// of this feature): an order already in_progress (more staff being added or
// removed later) is left as-is, and this is never called for a
// completed/delivered/cancelled order since callers reject those earlier.
// Removing every assignment from an in_progress order deliberately does NOT
// revert it to pending — nothing in the existing workflow supports orders
// reopening themselves, so that direction is simply never implemented.
const maybeAdvanceToInProgress = async (order, tenantId, userId, session) => {
  if (order.productionStatus !== "pending") return false;
  order.productionStatus = "in_progress";
  order.updatedBy = userId;
  await order.save({ session });
  await OrderItem.updateMany(
    { orderId: order._id, tenantId, status: "pending" },
    { status: "in_progress", updatedBy: userId },
    { session },
  );
  return true;
};

// Owner/authorized-employee entry point for "Assign Employees" on an order —
// the single place that (a) reconciles a flat list of employeeIds against
// whoever is currently assigned (adds new ones, removes unchecked ones,
// leaves the rest untouched — no duplicate records for the same step) and
// (b) advances the order pending -> in_progress as a direct, atomic
// consequence, per claude.md sections 4/14 of this feature.
//
// A flat employeeId list (not caller-specified workflow steps) is what the
// Assign Employees modal now sends — an order can span multiple OrderItems
// (multiple products), each with its own workflow, so THIS function does the
// (employee -> which open step) matching server-side by skill, the same way
// createOrderItemAssignment already validates a single tuple; the frontend
// never gets to say "trust me, put them on step 3."
export const syncOrderAssignments = async (tenantId, orderId, employeeIds, userId) => {
  if (!Array.isArray(employeeIds)) {
    throw new AppError("employeeIds must be an array", 400);
  }
  // Dedupe — the same employee checked once must not be processed twice.
  const requestedIds = [...new Set(employeeIds.map(String))];

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const order = await Order.findOne({ _id: orderId, tenantId }).session(session);
    if (!order) throw new AppError("Order not found", 404);
    if (["completed", "delivered", "cancelled"].includes(order.productionStatus)) {
      throw new AppError(
        `Order is already ${order.productionStatus} — employee assignments can no longer be changed`,
        409,
      );
    }

    const items = await OrderItem.find({ orderId, tenantId }).session(session);
    const itemIds = items.map((i) => i._id);
    if (itemIds.length === 0) {
      throw new AppError("Order has no items to assign employees to", 400);
    }

    // Every requested employee must actually belong to this tenant — never
    // trust that an id the frontend sent is real or in-tenant, even though
    // the frontend only ever offers its own tenant's employees to pick from.
    const requestedEmployees = requestedIds.length
      ? await Employee.find({
          _id: { $in: requestedIds },
          tenantId,
          isDeleted: false,
        }).session(session)
      : [];
    if (requestedEmployees.length !== requestedIds.length) {
      throw new AppError("One or more selected employees were not found for this tenant", 404);
    }
    const employeeById = new Map(requestedEmployees.map((e) => [String(e._id), e]));

    const existingAssignments = await OrderItemAssignment.find({
      orderItemId: { $in: itemIds },
      tenantId,
      status: { $ne: "reassigned" },
    }).session(session);
    const existingByEmployeeId = new Map(
      existingAssignments.map((a) => [String(a.employeeId), a]),
    );

    // Remove first — an unchecked employee's step becomes open again in the
    // SAME pass an incoming employee might need it (e.g. swapping the Tailor
    // from Ahmed to Ali in one save).
    const toRemove = existingAssignments.filter((a) => !requestedIds.includes(String(a.employeeId)));
    for (const assignment of toRemove) {
      await OrderItemAssignment.deleteOne({ _id: assignment._id, tenantId }, { session });
    }

    const productTypeIds = [...new Set(items.map((i) => String(i.productTypeId)))];
    const productTypes = await ProductType.find({
      _id: { $in: productTypeIds },
      tenantId,
    }).session(session);
    const workflowByProductTypeId = new Map(productTypes.map((pt) => [String(pt._id), pt.workflow]));

    // Steps still occupied after removals (an existing employee who stayed
    // checked keeps their step) — additions must never double-book one.
    const occupiedStepKeys = new Set(
      existingAssignments
        .filter((a) => requestedIds.includes(String(a.employeeId)))
        .map((a) => `${a.orderItemId}-${a.workflowStep.sequence}`),
    );

    // Every still-open (item, step) pair, independent of which employee ends
    // up filling it — computed once so each candidate can be scored against
    // the same snapshot before any of them claims one.
    const openStepCandidates = [];
    for (const item of items) {
      const workflow = workflowByProductTypeId.get(String(item.productTypeId)) || [];
      for (const step of [...workflow].sort((a, b) => a.sequence - b.sequence)) {
        const key = `${item._id}-${step.sequence}`;
        if (!occupiedStepKeys.has(key)) openStepCandidates.push({ item, step, key });
      }
    }

    const created = [];
    const toAdd = requestedIds.filter((id) => !existingByEmployeeId.has(id));
    // Most-constrained-first: an employee with only one matching skill (e.g.
    // "Cutting" only) is placed before a broadly-skilled one (e.g. a lead
    // tailor who can do everything) — otherwise the generalist greedily
    // claims the one step the specialist actually needed, and a perfectly
    // valid selection gets rejected for no real reason. Ties keep the
    // caller's original order (stable sort) so behavior stays predictable.
    const matchCount = (employeeId) => {
      const employee = employeeById.get(employeeId);
      return openStepCandidates.filter((c) => employee.skills.includes(c.step.requiredSkill)).length;
    };
    const orderedToAdd = toAdd
      .map((id, index) => ({ id, index, count: matchCount(id) }))
      .sort((a, b) => a.count - b.count || a.index - b.index)
      .map((e) => e.id);

    for (const employeeId of orderedToAdd) {
      const employee = employeeById.get(employeeId);
      const matchIndex = openStepCandidates.findIndex((c) => employee.skills.includes(c.step.requiredSkill));
      if (matchIndex === -1) {
        throw new AppError(
          `${employee.name} has no matching open production step on this order (check their skills)`,
          400,
        );
      }
      const [matched] = openStepCandidates.splice(matchIndex, 1);
      const assignment = await createOrderItemAssignment(
        tenantId,
        { orderItemId: matched.item._id, sequence: matched.step.sequence, employeeId },
        userId,
        session,
      );
      created.push(assignment);
    }

    const statusChanged = await maybeAdvanceToInProgress(order, tenantId, userId, session);

    await session.commitTransaction();
    return {
      order,
      added: created.length,
      removed: toRemove.length,
      statusChanged,
    };
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
