import Inventory from "../Models/Inventory.js";
import InventoryTransaction from "../Models/InventoryTransaction.js";
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
  if (filters.category) query.category = filters.category;
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
    category,
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

  return Inventory.create({
    tenantId,
    fabricName,
    fabricCode,
    category,
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
    "category",
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
      },
    ],
    { session },
  );

  return item;
};

// Aggregates fabric requirements across the given OrderItems (each already
// carrying fabricId/requiredFabricLength/quantity) and confirms every fabric
// has enough availableQuantity. Throws before anything is deducted, so a
// short fabric blocks the whole Order confirmation atomically.
export const validateStock = async (tenantId, items, session) => {
  const requiredByFabric = new Map();
  for (const item of items) {
    if (!item.fabricId) continue;
    const key = String(item.fabricId);
    const needed = (item.requiredFabricLength || 0) * (item.quantity || 1);
    requiredByFabric.set(key, (requiredByFabric.get(key) || 0) + needed);
  }

  for (const [fabricId, needed] of requiredByFabric) {
    const inventory = await Inventory.findOne({
      _id: fabricId,
      tenantId,
      isDeleted: false,
    }).session(session ?? null);
    if (!inventory) throw new AppError("Inventory item not found for this tenant", 404);
    if (inventory.availableQuantity < needed) {
      throw new AppError("Insufficient inventory for selected fabric.", 400);
    }
  }
};

// Deducts fabric for each OrderItem individually (so every InventoryTransaction
// keeps a precise orderItemId link) and writes an "Order Consumption" record.
// Callers must run validateStock first within the same transaction.
export const deductInventory = async (tenantId, items, orderId, userId, session) => {
  for (const item of items) {
    if (!item.fabricId) continue;
    const needed = (item.requiredFabricLength || 0) * (item.quantity || 1);
    if (needed <= 0) continue;

    const inventory = await Inventory.findOne({
      _id: item.fabricId,
      tenantId,
      isDeleted: false,
    }).session(session);
    if (!inventory) throw new AppError("Inventory item not found for this tenant", 404);

    const previousStock = inventory.availableQuantity;
    if (previousStock < needed) {
      throw new AppError("Insufficient inventory for selected fabric.", 400);
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
};

// Reverses deductInventory — used when an Order is cancelled before
// production begins. Writes a "Return" record per item restored.
export const restoreInventory = async (tenantId, items, orderId, userId, session) => {
  for (const item of items) {
    if (!item.fabricId) continue;
    const restored = (item.requiredFabricLength || 0) * (item.quantity || 1);
    if (restored <= 0) continue;

    const inventory = await Inventory.findOne({ _id: item.fabricId, tenantId }).session(
      session,
    );
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
          transactionType: "Return",
          quantity: restored,
          previousStock,
          newStock,
          remarks: "Restored — order cancelled before production began",
          createdBy: userId,
        },
      ],
      { session },
    );
  }
};

export { VALID_UNITS };
