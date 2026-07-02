import OrderItemAssignment from "../Models/OrderItemAssignment.js";
import OrderItem from "../Models/OrderItem.js";
import ProductType from "../Models/ProductType.js";
import Employee from "../Models/Employee.js";
import AppError from "../utils/AppError.js";

const VALID_STATUSES = ["pending", "in_progress", "completed", "reassigned"];

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

export const createOrderItemAssignment = async (tenantId, data, userId) => {
  const { orderItemId, employeeId, sequence, notes } = data;

  if (!orderItemId || !employeeId || sequence === undefined) {
    throw new AppError("orderItemId, employeeId, and sequence are required", 400);
  }

  const orderItem = await OrderItem.findOne({ _id: orderItemId, tenantId });
  if (!orderItem) throw new AppError("Order item not found for this tenant", 404);

  const productType = await ProductType.findOne({
    _id: orderItem.productTypeId,
    tenantId,
  });
  if (!productType) throw new AppError("Product type not found for this tenant", 404);

  const workflowStep = productType.workflow.find((step) => step.sequence === sequence);
  if (!workflowStep) {
    throw new AppError(`No workflow step with sequence ${sequence} on this product type`, 400);
  }

  const employee = await Employee.findOne({
    _id: employeeId,
    tenantId,
    isDeleted: false,
  });
  if (!employee) throw new AppError("Employee not found for this tenant", 404);
  if (!employee.skills.includes(workflowStep.requiredSkill)) {
    throw new AppError(
      `Employee does not have the required skill: ${workflowStep.requiredSkill}`,
      400,
    );
  }

  return OrderItemAssignment.create({
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
  });
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
