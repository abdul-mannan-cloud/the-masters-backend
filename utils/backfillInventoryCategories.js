import Inventory from "../Models/Inventory.js";
import InventoryCategory from "../Models/InventoryCategory.js";
import Tenant from "../Models/Tenant.js";

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// One-time migration: a tenant created before the category hierarchy landed
// still has Inventory items carrying the old flat `category` string (no
// longer declared on the schema, but still present in the raw stored
// document — read via the driver collection directly, since Mongoose won't
// surface an undeclared path) and no `categoryId`. For each tenant, every
// distinct non-empty legacy string becomes one top-level InventoryCategory
// (reusing one if the tenant already created a same-named category itself
// before this ran), and every item that had that string gets pointed at it
// via categoryId; the old string is then unset. Idempotent — matches items
// still missing categoryId OR still carrying a leftover `category` field
// (self-healing against a partial prior run), so a fully-migrated tenant is
// a no-op on every later boot.
export const backfillInventoryCategories = async () => {
  const tenants = await Tenant.find({ isDeleted: false });

  for (const tenant of tenants) {
    const uncategorized = await Inventory.collection
      .find({
        tenantId: tenant._id,
        $or: [{ categoryId: null }, { category: { $exists: true } }],
      })
      .toArray();
    if (uncategorized.length === 0) continue;

    const categoryIdByName = new Map();

    for (const legacyItem of uncategorized) {
      const rawName = (legacyItem.category || "").trim() || "Other";

      let categoryId = categoryIdByName.get(rawName);
      if (!categoryId) {
        let category = await InventoryCategory.findOne({
          tenantId: tenant._id,
          parentCategoryId: null,
          name: { $regex: `^${escapeRegex(rawName)}$`, $options: "i" },
          isDeleted: false,
        });
        if (!category) {
          category = await InventoryCategory.create({
            tenantId: tenant._id,
            name: rawName,
            parentCategoryId: null,
            createdBy: tenant.createdBy,
            updatedBy: tenant.createdBy,
          });
        }
        categoryId = category._id;
        categoryIdByName.set(rawName, categoryId);
      }

      // Mongoose's strict mode silently drops update operators that target a
      // path no longer declared on the schema — `category` isn't declared
      // anymore, so $unset-ing it via the Model would be a no-op. Go through
      // the raw driver collection to actually remove the old field.
      await Inventory.collection.updateOne(
        { _id: legacyItem._id },
        { $set: { categoryId }, $unset: { category: "" } },
      );
    }
  }
};
