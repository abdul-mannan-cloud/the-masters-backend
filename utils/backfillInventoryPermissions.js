import Role from "../Models/Role.js";

// Boot-time migration: Roles created before the Inventory module existed have
// no "inventory" key stored in their permissions subdocument at all. Mongoose
// hydration papers over this on read (defaults every action to false), so
// existing Manager/Receptionist/Tailor accounts would silently lose all
// Inventory access until a tenant_admin manually re-saved their Role.
// Only touches the three default role NAMES (matching
// utils/seedDefaultRoles.js) and only where inventory truly isn't stored yet
// — a tenant_admin who already customized permissions is left untouched.
export const backfillInventoryPermissions = async () => {
  const raw = await Role.collection
    .find({
      name: { $in: ["Manager", "Receptionist", "Tailor"] },
      "permissions.inventory": { $exists: false },
    })
    .toArray();

  for (const doc of raw) {
    const inventory =
      doc.name === "Receptionist" || doc.name === "Tailor"
        ? { view: true, create: false, update: false, delete: false }
        : { view: true, create: true, update: true, delete: true }; // Manager

    await Role.collection.updateOne(
      { _id: doc._id },
      { $set: { "permissions.inventory": inventory } },
    );
  }
};
