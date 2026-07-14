import Role from "../Models/Role.js";
import Employee from "../Models/Employee.js";
import User from "../Models/User.js";
import Tenant from "../Models/Tenant.js";
import { buildPermissionsObject } from "./permissions.js";

// "Almost everything except business settings" per the product spec.
const managerPermissions = buildPermissionsObject(true);
managerPermissions.settings = { view: false, create: false, update: false, delete: false };

const receptionistPermissions = buildPermissionsObject(false);
receptionistPermissions.dashboard.view = true;
receptionistPermissions.customers = { view: true, create: true, update: true, delete: false };
receptionistPermissions.measurements = { view: true, create: true, update: true, delete: false };
receptionistPermissions.orders = { view: true, create: true, update: true, delete: false };
receptionistPermissions.inventory.view = true;

const tailorPermissions = buildPermissionsObject(false);
tailorPermissions.dashboard.view = true;
tailorPermissions.orders.view = true;
tailorPermissions.inventory.view = true;

const DEFAULT_ROLE_DEFINITIONS = [
  {
    name: "Manager",
    description: "Almost full access, excluding business settings.",
    permissions: managerPermissions,
  },
  {
    name: "Receptionist",
    description: "Handles customers, measurements, and orders.",
    permissions: receptionistPermissions,
  },
  {
    name: "Tailor",
    description: "Views orders assigned to them for production.",
    permissions: tailorPermissions,
  },
];

// Creates the tenant's starter Roles. Idempotent per tenant (skipped if any Role
// already exists) so it's safe to call both at tenant-creation time and from the
// boot-time backfill migration below.
export const seedRolesForTenant = async (tenantId, userId, session) => {
  const existingCount = await Role.countDocuments({ tenantId }).session(session ?? null);
  if (existingCount > 0) return;

  await Role.create(
    DEFAULT_ROLE_DEFINITIONS.map((def) => ({
      tenantId,
      name: def.name,
      description: def.description,
      permissions: def.permissions,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    })),
    { session },
  );
};

// Boot-time migration: seeds default Roles for any pre-existing tenant that has
// none, then assigns the tenant's "Manager" Role to any legacy role:"manager"
// User's linked Employee that doesn't have one yet — otherwise those accounts
// would be locked out the instant authorize() checks go live.
export const backfillRolesForExistingTenants = async () => {
  const tenants = await Tenant.find({ isDeleted: false });

  for (const tenant of tenants) {
    await seedRolesForTenant(tenant._id, tenant.createdBy);

    const managerRole = await Role.findOne({ tenantId: tenant._id, name: "Manager" });
    if (!managerRole) continue;

    const managerUsers = await User.find({ tenantId: tenant._id, role: "manager" });
    for (const managerUser of managerUsers) {
      if (!managerUser.employeeId) continue;
      await Employee.updateOne(
        { _id: managerUser.employeeId, roleId: null },
        { roleId: managerRole._id },
      );
    }
  }
};
