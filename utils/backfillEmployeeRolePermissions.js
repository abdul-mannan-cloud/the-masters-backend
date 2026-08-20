import Role from "../Models/Role.js";
import { buildPermissionsObject } from "./permissions.js";

// Boot-time migration: the "Employee" starter Role used to grant broad
// create/update access (customers, measurements, orders, payments) plus full
// inventory CRUD out of the box. It's now seeded read-only by default (see
// utils/seedDefaultRoles.js) so a new employee account only gets write
// access a tenant_admin explicitly grants. Existing tenants already have an
// "Employee" Role seeded with the old, broader template — this resets ONLY
// Roles whose permissions still exactly match that old default, so a
// tenant_admin who already customized their "Employee" Role is left alone.
const OLD_EMPLOYEE_PERMISSIONS = buildPermissionsObject(false);
OLD_EMPLOYEE_PERMISSIONS.dashboard.view = true;
OLD_EMPLOYEE_PERMISSIONS.customers = { view: true, create: true, update: true, delete: false };
OLD_EMPLOYEE_PERMISSIONS.measurements = { view: true, create: true, update: true, delete: false };
OLD_EMPLOYEE_PERMISSIONS.productTypes.view = true;
OLD_EMPLOYEE_PERMISSIONS.orders = { view: true, create: true, update: true, delete: false };
OLD_EMPLOYEE_PERMISSIONS.employees.view = true;
OLD_EMPLOYEE_PERMISSIONS.payments = { view: true, create: true, update: true, delete: false };
OLD_EMPLOYEE_PERMISSIONS.inventory = { view: true, create: true, update: true, delete: true };

const NEW_EMPLOYEE_PERMISSIONS = buildPermissionsObject(false);
NEW_EMPLOYEE_PERMISSIONS.dashboard.view = true;
NEW_EMPLOYEE_PERMISSIONS.customers.view = true;
NEW_EMPLOYEE_PERMISSIONS.measurements.view = true;
NEW_EMPLOYEE_PERMISSIONS.productTypes.view = true;
NEW_EMPLOYEE_PERMISSIONS.orders.view = true;
NEW_EMPLOYEE_PERMISSIONS.employees.view = true;
NEW_EMPLOYEE_PERMISSIONS.payments.view = true;
NEW_EMPLOYEE_PERMISSIONS.inventory.view = true;

export const backfillEmployeeRolePermissions = async () => {
  const candidates = await Role.collection
    .find({ name: "Employee" })
    .toArray();

  for (const doc of candidates) {
    const matchesOldDefault =
      JSON.stringify(doc.permissions) === JSON.stringify(OLD_EMPLOYEE_PERMISSIONS);
    if (!matchesOldDefault) continue;

    await Role.collection.updateOne(
      { _id: doc._id },
      { $set: { permissions: NEW_EMPLOYEE_PERMISSIONS } },
    );
  }
};

// Follow-up migration: the read-only "Employee" default above now also
// grants customers.create/orders.create (see seedDefaultRoles.js — front-
// of-shop staff need to register customers and place orders as core work,
// not an opt-in extra). Existing tenants already have an "Employee" Role
// seeded with the read-only-only template from the migration above — this
// upgrades ONLY Roles that still exactly match that template, same
// "leave any tenant_admin customization alone" rule as before.
const WITH_CREATE_ACCESS = buildPermissionsObject(false);
WITH_CREATE_ACCESS.dashboard.view = true;
WITH_CREATE_ACCESS.customers.view = true;
WITH_CREATE_ACCESS.customers.create = true;
WITH_CREATE_ACCESS.measurements.view = true;
WITH_CREATE_ACCESS.productTypes.view = true;
WITH_CREATE_ACCESS.orders.view = true;
WITH_CREATE_ACCESS.orders.create = true;
WITH_CREATE_ACCESS.employees.view = true;
WITH_CREATE_ACCESS.payments.view = true;
WITH_CREATE_ACCESS.inventory.view = true;

export const backfillEmployeeCreateAccess = async () => {
  const candidates = await Role.collection.find({ name: "Employee" }).toArray();

  for (const doc of candidates) {
    const matchesReadOnlyDefault =
      JSON.stringify(doc.permissions) === JSON.stringify(NEW_EMPLOYEE_PERMISSIONS);
    if (!matchesReadOnlyDefault) continue;

    await Role.collection.updateOne(
      { _id: doc._id },
      { $set: { permissions: WITH_CREATE_ACCESS } },
    );
  }
};
