import Role from "../Models/Role.js";
import Employee from "../Models/Employee.js";
import User from "../Models/User.js";
import Tenant from "../Models/Tenant.js";
import { buildPermissionsObject } from "./permissions.js";

// Single general-purpose starter role — the product now has only one
// user-facing employee category ("Employee"); named categories like the old
// Manager/Receptionist/Tailor are no longer seeded. This is deliberately NOT
// a hardcoded ceiling: a tenant_admin can still create/rename/delete
// additional custom Roles at any time via the existing Role management UI
// (RoleService already supports arbitrary names — see roles/Form.jsx) for
// future categories like Supervisor/Accountant, without any schema change.
// Enough access to actually run the core workflow end to end (browse the
// catalog, take measurements, serve customers, place + confirm an order,
// pick inventory, record a payment) but not to touch other employees'
// accounts or business settings — those stay owner-level by default.
const employeePermissions = buildPermissionsObject(false);
employeePermissions.dashboard.view = true;
employeePermissions.customers = { view: true, create: true, update: true, delete: false };
employeePermissions.measurements = { view: true, create: true, update: true, delete: false };
employeePermissions.productTypes.view = true;
employeePermissions.orders = { view: true, create: true, update: true, delete: false };
employeePermissions.employees.view = true;
employeePermissions.payments = { view: true, create: true, update: true, delete: false };
employeePermissions.inventory = { view: true, create: true, update: true, delete: true };

const DEFAULT_ROLE_DEFINITIONS = [
  {
    name: "Employee",
    description: "General staff access — customers, orders, inventory, and payments.",
    permissions: employeePermissions,
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
