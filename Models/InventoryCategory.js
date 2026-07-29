import mongoose from "mongoose";

// Self-referential — parentCategoryId may point at another InventoryCategory
// in the same tenant, and there is no depth limit (Buttons -> Colored
// Buttons -> Black Buttons is just as valid as a single flat level). A null
// parentCategoryId means this is a top-level category.
const inventoryCategorySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    parentCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryCategory",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Two sibling categories under the same parent (or both top-level, when
// parentCategoryId is null) can't share a name — but the same name IS
// allowed at different places in the tree (e.g. a "Black" subcategory under
// both "Buttons" and "Thread"). The {tenantId, parentCategoryId} prefix of
// this same compound index also serves "list this category's direct
// children", the core drill-down query — no separate index needed.
//
// partialFilterExpression scopes the constraint to non-deleted documents
// only — without it, soft-deleting a category would permanently reserve its
// name (a plain unique index has no concept of isDeleted, so a later
// document reusing that same name+parent would collide with the deleted
// one forever).
inventoryCategorySchema.index(
  { tenantId: 1, parentCategoryId: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

export default mongoose.model("InventoryCategory", inventoryCategorySchema);
