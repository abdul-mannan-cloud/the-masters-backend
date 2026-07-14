// Canonical list of modules and actions the permission system understands.
// Role.permissions and any authorize(module, action) call must only ever
// reference names from these two lists — keep Models/Role.js in sync if this changes.
export const PERMISSION_MODULES = [
  "dashboard",
  "customers",
  "measurements",
  "productTypes",
  "orders",
  "employees",
  "payments",
  "notifications",
  "settings",
  "inventory",
];

export const PERMISSION_ACTIONS = ["view", "create", "update", "delete"];

export const buildPermissionsObject = (value = false) =>
  Object.fromEntries(
    PERMISSION_MODULES.map((module) => [
      module,
      Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, value])),
    ]),
  );

export const FULL_ACCESS_PERMISSIONS = buildPermissionsObject(true);
