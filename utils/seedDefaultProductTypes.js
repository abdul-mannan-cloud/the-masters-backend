import ProductType from "../Models/ProductType.js";
import Tenant from "../Models/Tenant.js";

const field = (id, label, displayOrder, required = true) => ({
  id,
  label,
  unit: "inch",
  required,
  displayOrder,
});

const step = (sequence, stepName, requiredSkill) => ({ sequence, step: stepName, requiredSkill });

// Cutting -> Tailoring -> Finishing -> Packing covers every garment here.
// Sherwani and Gown additionally get an Embroidery pass before tailoring —
// the two most likely to be ordered with embroidered work in this catalog.
const STANDARD_WORKFLOW = [
  step(1, "Cutting", "Cutting"),
  step(2, "Tailoring", "Tailoring"),
  step(3, "Finishing", "Finishing"),
  step(4, "Packing", "Packing"),
];

const EMBROIDERED_WORKFLOW = [
  step(1, "Cutting", "Cutting"),
  step(2, "Embroidery", "Embroidery"),
  step(3, "Tailoring", "Tailoring"),
  step(4, "Finishing", "Finishing"),
  step(5, "Packing", "Packing"),
];

const option = (name, values) => ({ name, values });

// The platform's starter catalog, copied into a tenant's own ProductType
// collection at signup (copy-on-signup — see seedProductTypesForTenant
// below). Every field here is editable by the tenant afterward; editing a
// tenant's copy never touches another tenant's copy or this list itself.
const DEFAULT_PRODUCT_TYPE_DEFINITIONS = [
  {
    name: "Men's Kameez",
    description: "Traditional men's kameez (shirt).",
    category: "Men",
    basePrice: 1500,
    displayOrder: 0,
    measurementTemplate: [
      field("chest", "Chest", 0),
      field("shoulder", "Shoulder", 1),
      field("sleeveLength", "Sleeve Length", 2),
      field("kameezLength", "Kameez Length", 3),
      field("neck", "Neck", 4),
    ],
    options: [
      option("Collar", ["Chinese", "Round", "Coat"]),
      option("Cuff", ["Round", "Straight"]),
    ],
    workflow: STANDARD_WORKFLOW,
  },
  {
    name: "Men's Shalwar",
    description: "Traditional men's shalwar.",
    category: "Men",
    basePrice: 1200,
    displayOrder: 1,
    measurementTemplate: [
      field("waist", "Waist", 0),
      field("hip", "Hip", 1),
      field("shalwarLength", "Shalwar Length", 2),
      field("thigh", "Thigh", 3),
      field("bottom", "Bottom (Mohri)", 4),
    ],
    options: [option("Pocket", ["With Pocket", "Without Pocket"])],
    workflow: STANDARD_WORKFLOW,
  },
  {
    name: "Men's Trouser",
    description: "Formal/casual men's trouser.",
    category: "Men",
    basePrice: 1800,
    displayOrder: 2,
    measurementTemplate: [
      field("waist", "Waist", 0),
      field("hip", "Hip", 1),
      field("trouserLength", "Trouser Length", 2),
      field("thigh", "Thigh", 3),
      field("bottom", "Bottom", 4),
    ],
    options: [option("Pocket Style", ["Side Pockets", "Back Pocket", "Both"])],
    workflow: STANDARD_WORKFLOW,
  },
  {
    name: "Men's Waistcoat",
    description: "Tailored men's waistcoat.",
    category: "Men",
    basePrice: 2000,
    displayOrder: 3,
    measurementTemplate: [
      field("chest", "Chest", 0),
      field("shoulder", "Shoulder", 1),
      field("waistcoatLength", "Waistcoat Length", 2),
      field("armhole", "Armhole", 3),
    ],
    options: [option("Buttons", ["4 Button", "5 Button"])],
    workflow: STANDARD_WORKFLOW,
  },
  {
    name: "Men's Sherwani",
    description: "Formal/wedding men's sherwani.",
    category: "Men",
    basePrice: 8000,
    displayOrder: 4,
    measurementTemplate: [
      field("chest", "Chest", 0),
      field("shoulder", "Shoulder", 1),
      field("sleeveLength", "Sleeve Length", 2),
      field("sherwaniLength", "Sherwani Length", 3),
      field("neck", "Neck", 4),
      field("armhole", "Armhole", 5),
    ],
    options: [
      option("Collar", ["Band Collar", "Coat Collar"]),
      option("Buttons", ["Fabric Covered", "Metal"]),
    ],
    workflow: EMBROIDERED_WORKFLOW,
  },
  {
    name: "Men's Kurta",
    description: "Casual men's kurta.",
    category: "Men",
    basePrice: 1500,
    displayOrder: 5,
    measurementTemplate: [
      field("chest", "Chest", 0),
      field("shoulder", "Shoulder", 1),
      field("sleeveLength", "Sleeve Length", 2),
      field("kurtaLength", "Kurta Length", 3),
      field("neck", "Neck", 4),
    ],
    options: [option("Collar", ["Round Neck", "Band Collar"])],
    workflow: STANDARD_WORKFLOW,
  },
  {
    name: "Men's Pajama",
    description: "Casual men's pajama.",
    category: "Men",
    basePrice: 1000,
    displayOrder: 6,
    measurementTemplate: [
      field("waist", "Waist", 0),
      field("hip", "Hip", 1),
      field("pajamaLength", "Pajama Length", 2),
      field("thigh", "Thigh", 3),
      field("bottom", "Bottom", 4),
    ],
    options: [option("Style", ["Straight", "Tapered"])],
    workflow: STANDARD_WORKFLOW,
  },
  {
    name: "Women's Kameez",
    description: "Traditional women's kameez.",
    category: "Women",
    basePrice: 2000,
    displayOrder: 7,
    measurementTemplate: [
      field("bust", "Bust", 0),
      field("waist", "Waist", 1),
      field("hip", "Hip", 2),
      field("shoulder", "Shoulder", 3),
      field("sleeveLength", "Sleeve Length", 4),
      field("kameezLength", "Kameez Length", 5),
    ],
    options: [
      option("Neckline", ["Round", "V-Neck", "Boat"]),
      option("Sleeve Style", ["Full", "3/4", "Sleeveless"]),
    ],
    workflow: STANDARD_WORKFLOW,
  },
  {
    name: "Women's Shalwar",
    description: "Traditional women's shalwar.",
    category: "Women",
    basePrice: 1200,
    displayOrder: 8,
    measurementTemplate: [
      field("waist", "Waist", 0),
      field("hip", "Hip", 1),
      field("shalwarLength", "Shalwar Length", 2),
      field("thigh", "Thigh", 3),
      field("bottom", "Bottom (Mohri)", 4),
    ],
    options: [option("Style", ["Patiala", "Straight", "Churidar"])],
    workflow: STANDARD_WORKFLOW,
  },
  {
    name: "Women's Trouser",
    description: "Formal/casual women's trouser.",
    category: "Women",
    basePrice: 1800,
    displayOrder: 9,
    measurementTemplate: [
      field("waist", "Waist", 0),
      field("hip", "Hip", 1),
      field("trouserLength", "Trouser Length", 2),
      field("thigh", "Thigh", 3),
      field("bottom", "Bottom", 4),
    ],
    options: [option("Fit", ["Slim", "Straight", "Wide"])],
    workflow: STANDARD_WORKFLOW,
  },
  {
    name: "Women's Dupatta",
    description: "Matching or contrast dupatta.",
    category: "Women",
    basePrice: 800,
    displayOrder: 10,
    measurementTemplate: [
      field("dupattaLength", "Dupatta Length", 0),
      field("dupattaWidth", "Dupatta Width", 1),
    ],
    options: [option("Border", ["Plain", "Laced", "Embroidered"])],
    workflow: STANDARD_WORKFLOW,
  },
  {
    name: "Women's Frock",
    description: "Casual/party women's frock.",
    category: "Women",
    basePrice: 3500,
    displayOrder: 11,
    measurementTemplate: [
      field("bust", "Bust", 0),
      field("waist", "Waist", 1),
      field("hip", "Hip", 2),
      field("shoulder", "Shoulder", 3),
      field("sleeveLength", "Sleeve Length", 4),
      field("frockLength", "Frock Length", 5),
    ],
    options: [
      option("Sleeve Style", ["Full", "3/4", "Sleeveless"]),
      option("Silhouette", ["A-Line", "Fitted"]),
    ],
    workflow: STANDARD_WORKFLOW,
  },
  {
    name: "Women's Abaya",
    description: "Modest women's abaya.",
    category: "Women",
    basePrice: 4500,
    displayOrder: 12,
    measurementTemplate: [
      field("bust", "Bust", 0),
      field("waist", "Waist", 1),
      field("hip", "Hip", 2),
      field("shoulder", "Shoulder", 3),
      field("sleeveLength", "Sleeve Length", 4),
      field("abayaLength", "Abaya Length", 5),
    ],
    options: [
      option("Style", ["Open Front", "Closed"]),
      option("Sleeve Style", ["Full", "Bell"]),
    ],
    workflow: STANDARD_WORKFLOW,
  },
  {
    name: "Women's Gown",
    description: "Formal/bridal women's gown.",
    category: "Women",
    basePrice: 9000,
    displayOrder: 13,
    measurementTemplate: [
      field("bust", "Bust", 0),
      field("waist", "Waist", 1),
      field("hip", "Hip", 2),
      field("shoulder", "Shoulder", 3),
      field("sleeveLength", "Sleeve Length", 4),
      field("gownLength", "Gown Length", 5),
    ],
    options: [option("Silhouette", ["A-Line", "Mermaid", "Ball Gown"])],
    workflow: EMBROIDERED_WORKFLOW,
  },
  {
    name: "Women's Pajama",
    description: "Casual women's pajama.",
    category: "Women",
    basePrice: 1000,
    displayOrder: 14,
    measurementTemplate: [
      field("waist", "Waist", 0),
      field("hip", "Hip", 1),
      field("pajamaLength", "Pajama Length", 2),
      field("thigh", "Thigh", 3),
      field("bottom", "Bottom", 4),
    ],
    options: [option("Style", ["Straight", "Tapered"])],
    workflow: STANDARD_WORKFLOW,
  },
];

// Copies the platform default templates into a brand-new tenant's own
// ProductType collection (copy-on-signup). Idempotent per tenant — skipped
// if the tenant already has any ProductType, same guard style as
// seedRolesForTenant — so it's safe to call both at tenant-creation time and
// from the boot-time backfill below.
export const seedProductTypesForTenant = async (tenantId, userId, session) => {
  const existingCount = await ProductType.countDocuments({ tenantId }).session(session ?? null);
  if (existingCount > 0) return;

  await ProductType.create(
    DEFAULT_PRODUCT_TYPE_DEFINITIONS.map((def) => ({
      tenantId,
      ...def,
      isActive: true,
      isDefaultTemplate: true,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    })),
    { session },
  );
};

// Boot-time migration: seeds the default templates for any pre-existing
// tenant that has none (e.g. tenants created before this feature existed).
export const backfillProductTypesForExistingTenants = async () => {
  const tenants = await Tenant.find({ isDeleted: false });

  for (const tenant of tenants) {
    await seedProductTypesForTenant(tenant._id, tenant.createdBy);
  }
};
