import Inventory from "../Models/Inventory.js";
import InventoryTransaction from "../Models/InventoryTransaction.js";
import InventoryCategory from "../Models/InventoryCategory.js";
import User from "../Models/User.js";
import Employee from "../Models/Employee.js";
import AppError from "../utils/AppError.js";

const VALID_UNITS = ["meter", "yard", "piece", "roll"];
// Manual actions available from the Inventory UI. "Order Consumption" and
// "Return" are written only by the automatic Order confirm/cancel flow below.
const MANUAL_TRANSACTION_TYPES = ["Purchase", "Manual Adjustment", "Return", "Damage"];

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const assertUniqueFabricCode = async (tenantId, fabricCode, excludeId) => {
  const query = {
    tenantId,
    isDeleted: false,
    fabricCode: { $regex: `^${escapeRegex(fabricCode.trim())}$`, $options: "i" },
  };
  if (excludeId) query._id = { $ne: excludeId };

  const existing = await Inventory.findOne(query);
  if (existing) {
    throw new AppError("Fabric code already exists.", 409);
  }
};

const assertCategoryExists = async (tenantId, categoryId) => {
  if (!categoryId) return;
  const category = await InventoryCategory.findOne({
    _id: categoryId,
    tenantId,
    isDeleted: false,
  });
  if (!category) throw new AppError("Inventory category not found for this tenant", 404);
};

// Resolves a display name for the ledger's "Performed By" column. `createdBy`
// is a User ref, not an Employee one, so a tenant_admin (no linked Employee)
// falls back to their email — same fallback used by getInventoryTransactions'
// enrichment elsewhere in this codebase.
const resolvePerformedByName = async (userId, session) => {
  if (!userId) return null;
  const user = await User.findById(userId).session(session ?? null);
  if (!user) return null;
  if (user.employeeId) {
    const employee = await Employee.findById(user.employeeId)
      .session(session ?? null)
      .select("name");
    if (employee?.name) return employee.name;
  }
  return user.email || null;
};

export const checkLowStock = (inventory) =>
  inventory.availableQuantity <= inventory.minimumStockLevel;

export const listInventory = async (tenantId, filters = {}) => {
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.max(parseInt(filters.limit, 10) || 10, 1);

  const query = { tenantId, isDeleted: false };

  if (filters.search) {
    const regex = { $regex: escapeRegex(filters.search.trim()), $options: "i" };
    query.$or = [{ fabricName: regex }, { fabricCode: regex }];
  }
  if (filters.categoryId) query.categoryId = filters.categoryId;
  if (filters.isActive === "true" || filters.isActive === true) {
    query.isActive = true;
  } else if (filters.isActive === "false" || filters.isActive === false) {
    query.isActive = false;
  }

  const sortField = ["fabricName", "availableQuantity", "createdAt"].includes(filters.sortBy)
    ? filters.sortBy
    : "createdAt";
  const sortOrder = filters.sortOrder === "asc" ? 1 : -1;

  const [data, total] = await Promise.all([
    Inventory.find(query)
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit),
    Inventory.countDocuments(query),
  ]);

  return {
    data: data.map((item) => ({
      ...item.toObject(),
      isLowStock: checkLowStock(item),
    })),
    total,
    page,
    limit,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
};

export const getLowStockItems = async (tenantId) => {
  const items = await Inventory.find({ tenantId, isDeleted: false, isActive: true }).sort({
    fabricName: 1,
  });
  return items
    .filter(checkLowStock)
    .map((item) => ({ ...item.toObject(), isLowStock: true }));
};

export const getInventoryById = async (tenantId, id) => {
  const item = await Inventory.findOne({ _id: id, tenantId, isDeleted: false });
  if (!item) throw new AppError("Inventory item not found", 404);
  return { ...item.toObject(), isLowStock: checkLowStock(item) };
};

export const getInventoryTransactions = async (tenantId, inventoryId, filters = {}) => {
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.max(parseInt(filters.limit, 10) || 20, 1);

  const query = { tenantId, inventoryId };
  if (filters.transactionType) query.transactionType = filters.transactionType;

  const [data, total] = await Promise.all([
    InventoryTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    InventoryTransaction.countDocuments(query),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
};

export const createInventory = async (tenantId, data, userId) => {
  const {
    fabricName,
    fabricCode,
    categoryId,
    color,
    supplier,
    unit,
    availableQuantity = 0,
    minimumStockLevel = 0,
    purchasePrice,
    sellingPrice,
    description,
    image,
    isActive,
  } = data;

  if (!fabricName || !fabricCode || !unit) {
    throw new AppError("fabricName, fabricCode, and unit are required", 400);
  }
  if (!VALID_UNITS.includes(unit)) {
    throw new AppError(`Invalid unit. Must be one of: ${VALID_UNITS.join(", ")}`, 400);
  }
  if (availableQuantity < 0) {
    throw new AppError("availableQuantity cannot be negative", 400);
  }
  if (purchasePrice !== undefined && purchasePrice < 0) {
    throw new AppError("purchasePrice cannot be negative", 400);
  }
  if (sellingPrice !== undefined && sellingPrice < 0) {
    throw new AppError("sellingPrice cannot be negative", 400);
  }
  await assertUniqueFabricCode(tenantId, fabricCode);
  await assertCategoryExists(tenantId, categoryId);

  return Inventory.create({
    tenantId,
    fabricName,
    fabricCode,
    categoryId: categoryId || null,
    color,
    supplier,
    unit,
    availableQuantity,
    minimumStockLevel,
    purchasePrice,
    sellingPrice,
    description,
    image,
    isActive,
    createdBy: userId,
    updatedBy: userId,
  });
};

// Metadata only — availableQuantity is never edited here. Stock changes must
// always go through adjustInventory (or the Order confirm/cancel flow) so
// every movement is captured in the InventoryTransaction ledger.
export const updateInventory = async (tenantId, id, data, userId) => {
  const allowedFields = [
    "fabricName",
    "fabricCode",
    "categoryId",
    "color",
    "supplier",
    "unit",
    "minimumStockLevel",
    "purchasePrice",
    "sellingPrice",
    "description",
    "image",
    "isActive",
  ];

  if (data.unit !== undefined && !VALID_UNITS.includes(data.unit)) {
    throw new AppError(`Invalid unit. Must be one of: ${VALID_UNITS.join(", ")}`, 400);
  }
  if (data.minimumStockLevel !== undefined && data.minimumStockLevel < 0) {
    throw new AppError("minimumStockLevel cannot be negative", 400);
  }
  if (data.purchasePrice !== undefined && data.purchasePrice < 0) {
    throw new AppError("purchasePrice cannot be negative", 400);
  }
  if (data.sellingPrice !== undefined && data.sellingPrice < 0) {
    throw new AppError("sellingPrice cannot be negative", 400);
  }
  if (data.fabricCode) {
    await assertUniqueFabricCode(tenantId, data.fabricCode, id);
  }
  if (data.categoryId !== undefined) {
    await assertCategoryExists(tenantId, data.categoryId);
  }

  const updates = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) updates[field] = data[field];
  }
  updates.updatedBy = userId;

  const item = await Inventory.findOneAndUpdate(
    { _id: id, tenantId, isDeleted: false },
    updates,
    { new: true, runValidators: true },
  );
  if (!item) throw new AppError("Inventory item not found", 404);
  return item;
};

export const deleteInventory = async (tenantId, id, userId) => {
  const item = await Inventory.findOneAndUpdate(
    { _id: id, tenantId, isDeleted: false },
    { isDeleted: true, deletedAt: new Date(), updatedBy: userId },
    { new: true },
  );
  if (!item) throw new AppError("Inventory item not found", 404);
  return item;
};

// Records a single manual stock movement — Purchase/Manual Adjustment/Return/
// Damage. quantity is signed for Manual Adjustment (+ increases, - decreases);
// for the other three it must be a positive magnitude, with direction implied
// by transactionType (Purchase/Return increase, Damage decreases).
export const adjustInventory = async (tenantId, id, data, userId, session) => {
  const { transactionType, quantity, remarks } = data;

  if (!MANUAL_TRANSACTION_TYPES.includes(transactionType)) {
    throw new AppError(
      `Invalid transactionType. Must be one of: ${MANUAL_TRANSACTION_TYPES.join(", ")}`,
      400,
    );
  }
  if (typeof quantity !== "number" || quantity === 0) {
    throw new AppError("quantity is required and must be a non-zero number", 400);
  }
  if (transactionType !== "Manual Adjustment" && quantity < 0) {
    throw new AppError(`quantity must be positive for ${transactionType}`, 400);
  }

  const item = await Inventory.findOne({ _id: id, tenantId, isDeleted: false }).session(
    session ?? null,
  );
  if (!item) throw new AppError("Inventory item not found", 404);

  const delta = transactionType === "Damage" ? -Math.abs(quantity) : quantity;
  const previousStock = item.availableQuantity;
  const newStock = previousStock + delta;
  if (newStock < 0) {
    throw new AppError("Insufficient inventory for this adjustment", 400);
  }

  item.availableQuantity = newStock;
  item.updatedBy = userId;
  await item.save({ session });

  const performedByName = await resolvePerformedByName(userId, session);
  await InventoryTransaction.create(
    [
      {
        tenantId,
        inventoryId: item._id,
        transactionType,
        quantity: Math.abs(delta),
        previousStock,
        newStock,
        remarks,
        createdBy: userId,
        performedByName,
      },
    ],
    { session },
  );

  return item;
};

// Flattens one OrderItem's fabric + materials[] into a single list of
// { inventoryId, needed } consumptions, scaled by the item's quantity — the
// one place that scaling rule lives, shared by validateStock/deductInventory/
// restoreInventory so they can never drift apart on how "needed" is computed.
const itemConsumptions = (item) => {
  const qty = item.quantity || 1;
  const consumptions = [];
  if (item.fabricId) {
    const needed = (item.requiredFabricLength || 0) * qty;
    if (needed > 0) consumptions.push({ inventoryId: item.fabricId, needed });
  }
  for (const material of item.materials || []) {
    const needed = (material.quantity || 0) * qty;
    if (needed > 0) consumptions.push({ inventoryId: material.inventoryId, needed });
  }
  return consumptions;
};

// Aggregates fabric + materials[] requirements across the given OrderItems
// and confirms every inventory item drawn on has enough availableQuantity.
// Throws before anything is deducted, so a single short item blocks the
// whole Order confirmation atomically.
export const validateStock = async (tenantId, items, session) => {
  const requiredByInventory = new Map();
  for (const item of items) {
    for (const { inventoryId, needed } of itemConsumptions(item)) {
      const key = String(inventoryId);
      requiredByInventory.set(key, (requiredByInventory.get(key) || 0) + needed);
    }
  }

  for (const [inventoryId, needed] of requiredByInventory) {
    const inventory = await Inventory.findOne({
      _id: inventoryId,
      tenantId,
      isDeleted: false,
    }).session(session ?? null);
    if (!inventory) throw new AppError("Inventory item not found for this tenant", 404);
    if (inventory.availableQuantity < needed) {
      throw new AppError(
        `Insufficient inventory for ${inventory.fabricName}: needs ${needed} ${inventory.unit}, only ${inventory.availableQuantity} ${inventory.unit} available`,
        400,
      );
    }
  }
};

// Deducts fabric for each OrderItem individually (so every InventoryTransaction
// keeps a precise orderItemId link) and writes an "Order Consumption" record.
// Callers must run validateStock first within the same transaction.
// `meta` ({orderNumber, customerName}) is snapshotted onto every transaction
// row alongside the resolved performedByName — see InventoryTransaction.js's
// comment for why these are copies, not live joins.
export const deductInventory = async (tenantId, items, orderId, userId, session, meta = {}) => {
  const performedByName = await resolvePerformedByName(userId, session);

  for (const item of items) {
    for (const { inventoryId, needed } of itemConsumptions(item)) {
      const inventory = await Inventory.findOne({
        _id: inventoryId,
        tenantId,
        isDeleted: false,
      }).session(session);
      if (!inventory) throw new AppError("Inventory item not found for this tenant", 404);

      const previousStock = inventory.availableQuantity;
      if (previousStock < needed) {
        throw new AppError(
          `Insufficient inventory for ${inventory.fabricName}: needs ${needed} ${inventory.unit}, only ${previousStock} ${inventory.unit} available`,
          400,
        );
      }
      const newStock = previousStock - needed;

      inventory.availableQuantity = newStock;
      inventory.updatedBy = userId;
      await inventory.save({ session });

      await InventoryTransaction.create(
        [
          {
            tenantId,
            inventoryId: inventory._id,
            orderId,
            orderItemId: item._id,
            orderNumber: meta.orderNumber ?? null,
            customerName: meta.customerName ?? null,
            productName: item.garmentType ?? null,
            performedByName,
            transactionType: "Order Consumption",
            quantity: needed,
            previousStock,
            newStock,
            remarks: "Deducted on order confirmation",
            createdBy: userId,
          },
        ],
        { session },
      );
    }
  }
};

// Reverses deductInventory — used when a confirmed Order is cancelled before
// production begins, or deleted outright. Writes a "Return" record per item
// restored. `meta` may include `remarks` to describe why (cancel vs delete);
// defaults to the cancel wording since that's the original/most common caller.
export const restoreInventory = async (tenantId, items, orderId, userId, session, meta = {}) => {
  const performedByName = await resolvePerformedByName(userId, session);

  for (const item of items) {
    for (const { inventoryId, needed: restored } of itemConsumptions(item)) {
      const inventory = await Inventory.findOne({ _id: inventoryId, tenantId }).session(session);
      if (!inventory) continue;

      const previousStock = inventory.availableQuantity;
      const newStock = previousStock + restored;

      inventory.availableQuantity = newStock;
      inventory.updatedBy = userId;
      await inventory.save({ session });

      await InventoryTransaction.create(
        [
          {
            tenantId,
            inventoryId: inventory._id,
            orderId,
            orderItemId: item._id,
            orderNumber: meta.orderNumber ?? null,
            customerName: meta.customerName ?? null,
            productName: item.garmentType ?? null,
            performedByName,
            transactionType: "Return",
            quantity: restored,
            previousStock,
            newStock,
            remarks: meta.remarks || "Restored — order cancelled before production began",
            createdBy: userId,
          },
        ],
        { session },
      );
    }
  }
};

export { VALID_UNITS, resolvePerformedByName };
