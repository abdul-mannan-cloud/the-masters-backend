import Tenant from "../Models/Tenant.js";

// Boot-time migration: any Tenant created before isDeleted/deletedAt existed
// on the schema has neither field stored at all — not `false`, genuinely
// absent. Every tenant-scoped query in this app filters on the literal
// `{ isDeleted: false }`, which does NOT match a document where the field is
// missing (MongoDB equality queries don't treat "absent" as "false"), so
// those tenants silently 404 everywhere despite being perfectly active.
// Idempotent — only touches documents where the field doesn't exist yet.
export const backfillTenantSoftDelete = async () => {
  await Tenant.updateMany(
    { isDeleted: { $exists: false } },
    { $set: { isDeleted: false, deletedAt: null } },
  );
};
