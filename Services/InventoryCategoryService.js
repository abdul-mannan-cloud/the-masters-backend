import mongoose from "mongoose";
import InventoryCategory from "../Models/InventoryCategory.js";
import Inventory from "../Models/Inventory.js";
import AppError from "../utils/AppError.js";

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A name only has to be unique among its own siblings (same parent), not
// tenant-wide — "Black" can exist under both Buttons and Thread.
const assertUniqueSiblingName = async (tenantId, parentCategoryId, name, excludeId) => {
  const query = {
    tenantId,
    parentCategoryId: parentCategoryId ?? null,
    name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" },
    isDeleted: false,
  };
  if (excludeId) query._id = { $ne: excludeId };

  const existing = await InventoryCategory.findOne(query);
  if (existing) {
    throw new AppError("A category with this name already exists at this level", 409);
  }
};

const assertParentExists = async (tenantId, parentCategoryId) => {
  if (!parentCategoryId) return;
  const parent = await InventoryCategory.findOne({
    _id: parentCategoryId,
    tenantId,
    isDeleted: false,
  });
  if (!parent) throw new AppError("Parent category not found for this tenant", 404);
};

// Direct children only (one level) — the drill-down UI fetches one level at
// a time, not the whole tree. Each result is annotated with whether it has
// its own subcategories and how many Inventory items sit directly in it, so
// the UI can render a card without a second round trip per category.
export const listCategories = async (tenantId, parentCategoryId = null) => {
  const categories = await InventoryCategory.find({
    tenantId,
    parentCategoryId: parentCategoryId ?? null,
    isDeleted: false,
  }).sort({ name: 1 });

  const categoryIds = categories.map((c) => c._id);
  if (categoryIds.length === 0) return [];

  // Aggregate's $match does NOT auto-cast query values the way a regular
  // find()/findOne() does — tenantId arrives here as a string (from the JWT),
  // so it must be cast to an ObjectId explicitly or it silently matches
  // nothing (same convention as TenantService.getTenantStats).
  const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

  const [childCounts, itemCounts] = await Promise.all([
    InventoryCategory.aggregate([
      { $match: { tenantId: tenantObjectId, parentCategoryId: { $in: categoryIds }, isDeleted: false } },
      { $group: { _id: "$parentCategoryId", count: { $sum: 1 } } },
    ]),
    Inventory.aggregate([
      { $match: { tenantId: tenantObjectId, categoryId: { $in: categoryIds }, isDeleted: false } },
      { $group: { _id: "$categoryId", count: { $sum: 1 } } },
    ]),
  ]);
  const childCountById = Object.fromEntries(childCounts.map((c) => [String(c._id), c.count]));
  const itemCountById = Object.fromEntries(itemCounts.map((c) => [String(c._id), c.count]));

  return categories.map((c) => ({
    ...c.toObject(),
    subcategoryCount: childCountById[String(c._id)] || 0,
    itemCount: itemCountById[String(c._id)] || 0,
  }));
};

// Every category for the tenant, flat, parent-before-child order — powers
// the Inventory Form's "which category does this item belong to" picker,
// which needs to offer any node at any depth, not just one level. A single
// query plus an in-memory sort is simpler and cheaper here than recursing
// per level over the network like the drill-down UI does.
export const listAllCategoriesFlat = async (tenantId) => {
  const categories = await InventoryCategory.find({ tenantId, isDeleted: false }).lean();

  const byParent = new Map();
  for (const category of categories) {
    const key = category.parentCategoryId ? String(category.parentCategoryId) : "root";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(category);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.name.localeCompare(b.name));
  }

  const ordered = [];
  const visit = (parentKey, depth) => {
    for (const category of byParent.get(parentKey) || []) {
      ordered.push({ ...category, depth });
      visit(String(category._id), depth + 1);
    }
  };
  visit("root", 0);

  return ordered;
};

export const getCategoryById = async (tenantId, id) => {
  const category = await InventoryCategory.findOne({ _id: id, tenantId, isDeleted: false });
  if (!category) throw new AppError("Inventory category not found", 404);
  return category;
};

// Walks parentCategoryId up to the root — powers the "Fabric > Cotton"
// breadcrumb on the item detail page and the category browser.
export const getCategoryPath = async (tenantId, id) => {
  const path = [];
  let current = await getCategoryById(tenantId, id);
  path.unshift(current);

  // A tenant can only ever create a bounded number of categories, but guard
  // against a corrupted/cyclic parent chain anyway rather than looping forever.
  let guard = 0;
  while (current.parentCategoryId && guard < 50) {
    current = await InventoryCategory.findOne({
      _id: current.parentCategoryId,
      tenantId,
      isDeleted: false,
    });
    if (!current) break;
    path.unshift(current);
    guard += 1;
  }

  return path;
};

export const createCategory = async (tenantId, data, userId) => {
  const { name, description, parentCategoryId } = data;

  if (!name || !name.trim()) {
    throw new AppError("name is required", 400);
  }
  await assertParentExists(tenantId, parentCategoryId);
  await assertUniqueSiblingName(tenantId, parentCategoryId, name);

  return InventoryCategory.create({
    tenantId,
    name: name.trim(),
    description,
    parentCategoryId: parentCategoryId || null,
    createdBy: userId,
    updatedBy: userId,
  });
};

// Renaming/deactivating only — moving a category to a different parent is
// deliberately not supported yet (would need cycle detection against its own
// descendants); a tenant can always delete-and-recreate elsewhere instead.
export const updateCategory = async (tenantId, id, data, userId) => {
  const category = await InventoryCategory.findOne({ _id: id, tenantId, isDeleted: false });
  if (!category) throw new AppError("Inventory category not found", 404);

  if (data.name !== undefined) {
    if (!data.name.trim()) throw new AppError("name cannot be empty", 400);
    await assertUniqueSiblingName(tenantId, category.parentCategoryId, data.name, id);
    category.name = data.name.trim();
  }
  if (data.description !== undefined) category.description = data.description;
  if (data.isActive !== undefined) category.isActive = data.isActive;
  category.updatedBy = userId;

  await category.save();
  return category;
};

export const deleteCategory = async (tenantId, id, userId) => {
  const category = await InventoryCategory.findOne({ _id: id, tenantId, isDeleted: false });
  if (!category) throw new AppError("Inventory category not found", 404);

  const [subcategoryCount, itemCount] = await Promise.all([
    InventoryCategory.countDocuments({ tenantId, parentCategoryId: id, isDeleted: false }),
    Inventory.countDocuments({ tenantId, categoryId: id, isDeleted: false }),
  ]);
  if (subcategoryCount > 0) {
    throw new AppError(
      `Cannot delete category — ${subcategoryCount} subcategory(ies) still exist under it`,
      409,
    );
  }
  if (itemCount > 0) {
    throw new AppError(
      `Cannot delete category — ${itemCount} inventory item(s) still belong to it`,
      409,
    );
  }

  category.isDeleted = true;
  category.deletedAt = new Date();
  category.updatedBy = userId;
  await category.save();
  return category;
};
