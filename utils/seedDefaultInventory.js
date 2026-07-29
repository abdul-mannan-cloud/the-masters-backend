import Inventory from "../Models/Inventory.js";
import InventoryCategory from "../Models/InventoryCategory.js";
import Tenant from "../Models/Tenant.js";

const item = (
  fabricName,
  fabricCode,
  unit,
  availableQuantity,
  minimumStockLevel,
  purchasePrice,
  sellingPrice,
  color,
) => ({
  fabricName,
  fabricCode,
  unit,
  availableQuantity,
  minimumStockLevel,
  purchasePrice,
  sellingPrice,
  ...(color && { color }),
});

// The platform's starter category tree + inventory, copied into a brand-new
// tenant's own collections at signup (copy-on-signup). Every category/item
// here is editable/deletable by the tenant afterward; editing a tenant's
// copy never touches another tenant's copy or this definition itself.
//
// A node is { name, items?: leaf Inventory items directly in this category,
// children?: nested category nodes }. Fabric demonstrates a subcategory
// (Cotton groups its three color variants) while every other top-level
// category attaches items directly, showing both shapes the hierarchy
// supports — nesting depth is a tenant choice, not a schema limit.
const DEFAULT_CATEGORY_TREE = [
  {
    name: "Buttons",
    items: [
      item("Buttons (Black)", "BTN-001", "piece", 500, 100, 2, 4, "Black"),
      item("Buttons (White)", "BTN-002", "piece", 500, 100, 2, 4, "White"),
      item("Metal Buttons", "BTN-003", "piece", 300, 50, 5, 8, "Silver"),
    ],
  },
  {
    name: "Fabric",
    items: [
      item("Lawn Fabric", "FAB-004", "meter", 80, 15, 220, 320, "White"),
      item("Silk Fabric", "FAB-005", "meter", 50, 10, 800, 1100, "Ivory"),
      item("Linen Fabric", "FAB-006", "meter", 60, 15, 450, 650, "Beige"),
      item("Denim Fabric", "FAB-007", "meter", 60, 15, 400, 600, "Blue"),
      item("Chiffon Fabric", "FAB-008", "meter", 40, 10, 350, 500),
      item("Lining Fabric", "FAB-009", "meter", 80, 20, 150, 220, "White"),
    ],
    children: [
      {
        name: "Cotton",
        items: [
          item("White Cotton Fabric", "FAB-001", "meter", 100, 20, 250, 350, "White"),
          item("Black Cotton Fabric", "FAB-002", "meter", 100, 20, 250, 350, "Black"),
          item("Navy Cotton Fabric", "FAB-003", "meter", 100, 20, 260, 360, "Navy"),
        ],
      },
    ],
  },
  {
    name: "Thread",
    items: [
      item("Black Thread", "THR-001", "roll", 50, 10, 30, 45, "Black"),
      item("White Thread", "THR-002", "roll", 50, 10, 30, 45, "White"),
      item("Blue Thread", "THR-003", "roll", 50, 10, 30, 45, "Blue"),
    ],
  },
  {
    name: "Zippers",
    items: [
      item("Invisible Zippers", "ZIP-001", "piece", 200, 40, 15, 25),
      item("Regular Zippers", "ZIP-002", "piece", 200, 40, 10, 18),
    ],
  },
  {
    name: "Accessories",
    items: [
      item("Elastic", "ACC-001", "meter", 100, 20, 15, 25),
      item("Shoulder Pads", "ACC-002", "piece", 100, 20, 20, 35),
      item("Hook & Eye", "ACC-003", "piece", 300, 50, 3, 6),
      item("Lace", "ACC-004", "meter", 60, 15, 60, 90, "White"),
      item("Interfacing", "ACC-005", "meter", 80, 20, 40, 60, "White"),
    ],
  },
  // Empty catch-all — a starter bucket for whatever doesn't fit the named
  // categories yet, per the product spec's example tree.
  { name: "Other", items: [] },
];

// Creates one category node, its items, then recurses into its children —
// everything inside the same session so the whole tree is atomic with the
// rest of tenant creation (or standalone during the boot-time backfill,
// where session is undefined).
const seedCategoryNode = async (tenantId, node, parentCategoryId, userId, session) => {
  const [category] = await InventoryCategory.create(
    [
      {
        tenantId,
        name: node.name,
        parentCategoryId: parentCategoryId ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    ],
    { session },
  );

  if (node.items?.length) {
    await Inventory.create(
      node.items.map((def) => ({
        tenantId,
        ...def,
        categoryId: category._id,
        isActive: true,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      })),
      { session },
    );
  }

  for (const child of node.children || []) {
    await seedCategoryNode(tenantId, child, category._id, userId, session);
  }
};

// Copies the platform's starter category tree + inventory into a brand-new
// tenant's own collections (copy-on-signup). Idempotent per tenant — skipped
// if the tenant already has any Inventory item, same guard style as
// seedProductTypesForTenant — so it's safe to call both at tenant-creation
// time and from the boot-time backfill below.
//
// Deliberately guarded on Inventory items existing, NOT on InventoryCategory
// existing: an existing tenant created before the category hierarchy landed
// has items but zero categories, and must NOT get this platform default tree
// seeded on top of its real data — that tenant's own flat `category` strings
// are migrated into their own categories separately, by
// backfillInventoryCategories() in backfillInventoryCategories.js.
export const seedInventoryForTenant = async (tenantId, userId, session) => {
  const existingCount = await Inventory.countDocuments({ tenantId }).session(session ?? null);
  if (existingCount > 0) return;

  for (const node of DEFAULT_CATEGORY_TREE) {
    await seedCategoryNode(tenantId, node, null, userId, session);
  }
};

// Boot-time migration: seeds the default category tree + inventory for any
// pre-existing tenant that has none (e.g. tenants created before this
// feature existed).
export const backfillInventoryForExistingTenants = async () => {
  const tenants = await Tenant.find({ isDeleted: false });

  for (const tenant of tenants) {
    await seedInventoryForTenant(tenant._id, tenant.createdBy);
  }
};
