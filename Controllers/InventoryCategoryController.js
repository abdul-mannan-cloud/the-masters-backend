import * as InventoryCategoryService from "../Services/InventoryCategoryService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

// Two shapes share this endpoint: ?parentCategoryId returns direct children
// only (the drill-down UI, one level at a time); ?flat=true returns every
// category for the tenant, depth-annotated (the Form's "pick any category at
// any depth" dropdown, which needs the whole tree at once).
export const getAllCategories = async (req, res) => {
  try {
    const { parentCategoryId, flat } = req.query;
    if (flat === "true") {
      const categories = await InventoryCategoryService.listAllCategoriesFlat(req.user.tenantId);
      return res.status(200).json(categories);
    }
    if (parentCategoryId && !isValidObjectId(parentCategoryId)) {
      throw new AppError("Invalid parentCategoryId format", 400);
    }
    const categories = await InventoryCategoryService.listCategories(
      req.user.tenantId,
      parentCategoryId || null,
    );
    return res.status(200).json(categories);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid category ID format", 400);
    }
    const category = await InventoryCategoryService.getCategoryById(req.user.tenantId, id);
    return res.status(200).json(category);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

// Ancestor chain root-first, e.g. [Fabric, Cotton] — powers the breadcrumb.
export const getCategoryPath = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid category ID format", 400);
    }
    const path = await InventoryCategoryService.getCategoryPath(req.user.tenantId, id);
    return res.status(200).json(path);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const createCategory = async (req, res) => {
  try {
    const category = await InventoryCategoryService.createCategory(
      req.user.tenantId,
      req.body,
      req.user.userId,
    );
    return res.status(201).json({ message: "Category created successfully.", category });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid category ID format", 400);
    }
    const category = await InventoryCategoryService.updateCategory(
      req.user.tenantId,
      id,
      req.body,
      req.user.userId,
    );
    return res.status(200).json({ message: "Category updated successfully.", category });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid category ID format", 400);
    }
    await InventoryCategoryService.deleteCategory(req.user.tenantId, id, req.user.userId);
    return res.status(200).json({ message: "Category deleted successfully." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
