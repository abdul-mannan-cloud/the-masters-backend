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
// Read-only by default — an employee can see the modules they need to do
// their job, but every write action (create/update/delete) must be granted
// explicitly by the tenant_admin per Role via the Role management UI. Keeps
// a brand-new employee account from being able to touch business data the
// moment it's created; access is opt-in, not opt-out.
//
// Two exceptions: customers.create and orders.create — front-of-shop staff
// need to be able to register a walk-in customer and place their order as
// core day-to-day work, not an opt-in extra. Creating an order already
// covers capturing new measurements for it (CustomerService/OrderItemService
// take measurements in the same request, gated only by the outer
// customers.create/orders.create check — there's no separate
// measurements.create call in that path), so no other module needs a
// matching create grant for this to work end to end.
const employeePermissions = buildPermissionsObject(false);
employeePermissions.dashboard.view = true;
employeePermissions.customers.view = true;
employeePermissions.customers.create = true;
employeePermissions.measurements.view = true;
employeePermissions.productTypes.view = true;
employeePermissions.orders.view = true;
employeePermissions.orders.create = true;
employeePermissions.employees.view = true;
employeePermissions.payments.view = true;
employeePermissions.inventory.view = true;

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
