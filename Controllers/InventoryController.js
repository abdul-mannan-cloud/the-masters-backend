import * as InventoryService from "../Services/InventoryService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

// multipart/form-data sends every field as a string; numeric fields need
// coercing back before they reach the service's numeric comparisons.
const NUMERIC_FIELDS = [
  "availableQuantity",
  "minimumStockLevel",
  "purchasePrice",
  "sellingPrice",
];

const resolveBody = (req) => {
  const body = { ...req.body };
  for (const field of NUMERIC_FIELDS) {
    if (body[field] !== undefined && body[field] !== "") body[field] = Number(body[field]);
  }
  if (req.file) body.image = req.file.path;
  return body;
};

export const getAllInventory = async (req, res) => {
  try {
    const { page, limit, search, categoryId, isActive, sortBy, sortOrder } = req.query;
    const result = await InventoryService.listInventory(req.user.tenantId, {
      page,
      limit,
      search,
      categoryId,
      isActive,
      sortBy,
      sortOrder,
    });
    return res.status(200).json(result);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getLowStockItems = async (req, res) => {
  try {
    const items = await InventoryService.getLowStockItems(req.user.tenantId);
    return res.status(200).json(items);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getInventoryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) throw new AppError("Invalid inventory ID format", 400);
    const item = await InventoryService.getInventoryById(req.user.tenantId, id);
    return res.status(200).json(item);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getInventoryTransactions = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) throw new AppError("Invalid inventory ID format", 400);
    const { page, limit, transactionType } = req.query;
    const result = await InventoryService.getInventoryTransactions(req.user.tenantId, id, {
      page,
      limit,
      transactionType,
    });
    return res.status(200).json(result);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const createInventory = async (req, res) => {
  try {
    const item = await InventoryService.createInventory(
      req.user.tenantId,
      resolveBody(req),
      req.user.userId,
    );
    return res.status(201).json({ message: "Inventory item created successfully.", item });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateInventory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) throw new AppError("Invalid inventory ID format", 400);
    const item = await InventoryService.updateInventory(
      req.user.tenantId,
      id,
      resolveBody(req),
      req.user.userId,
    );
    return res.status(200).json({ message: "Inventory item updated successfully.", item });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const deleteInventory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) throw new AppError("Invalid inventory ID format", 400);
    await InventoryService.deleteInventory(req.user.tenantId, id, req.user.userId);
    return res.status(200).json({ message: "Inventory item deleted successfully." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const adjustInventory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) throw new AppError("Invalid inventory ID format", 400);
    const { transactionType, quantity, remarks } = req.body;
    const item = await InventoryService.adjustInventory(
      req.user.tenantId,
      id,
      { transactionType, quantity: Number(quantity), remarks },
      req.user.userId,
    );
    return res.status(200).json({ message: "Inventory stock adjusted successfully.", item });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
