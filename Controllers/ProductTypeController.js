import * as ProductTypeService from "../Services/ProductTypeService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";
import PRODUCT_CATEGORIES from "../utils/productCategories.js";

export const getAllProductTypes = async (req, res) => {
  try {
    const { page, limit, search, isActive, category, gender } = req.query;
    const result = await ProductTypeService.listProductTypes(req.user.tenantId, {
      page,
      limit,
      search,
      isActive,
      category,
      gender,
    });
    return res.status(200).json(result);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getProductCategories = async (req, res) => {
  return res.status(200).json(PRODUCT_CATEGORIES);
};

export const getProductTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid product type ID format", 400);
    }
    const productType = await ProductTypeService.getProductTypeById(
      req.user.tenantId,
      id,
    );
    return res.status(200).json(productType);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const createProductType = async (req, res) => {
  try {
    const productType = await ProductTypeService.createProductType(
      req.user.tenantId,
      req.body,
      req.user.userId,
    );
    return res
      .status(201)
      .json({ message: "Product type created successfully.", productType });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateProductType = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid product type ID format", 400);
    }
    const productType = await ProductTypeService.updateProductType(
      req.user.tenantId,
      id,
      req.body,
      req.user.userId,
    );
    return res
      .status(200)
      .json({ message: "Product type updated successfully.", productType });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updatePreviewLayers = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid product type ID format", 400);
    }
    // previewMeta arrives as a JSON string (multipart form fields are always
    // strings) describing the preview structure; the actual image bytes are
    // the sibling files in req.files, cross-referenced by fieldName.
    let previewMeta;
    try {
      previewMeta = JSON.parse(req.body.previewMeta || "{}");
    } catch {
      throw new AppError("previewMeta must be valid JSON", 400);
    }
    const productType = await ProductTypeService.updatePreviewLayers(
      req.user.tenantId,
      id,
      previewMeta,
      req.files || [],
      req.user.userId,
    );
    return res
      .status(200)
      .json({ message: "Preview layers updated successfully.", productType });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const toggleProductTypeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid product type ID format", 400);
    }
    const productType = await ProductTypeService.toggleStatus(
      req.user.tenantId,
      id,
      req.body.isActive,
      req.user.userId,
    );
    return res
      .status(200)
      .json({ message: "Product type status updated successfully.", productType });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const deleteProductType = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid product type ID format", 400);
    }
    await ProductTypeService.deleteProductType(req.user.tenantId, id, req.user.userId);
    return res.status(200).json({ message: "Product type deleted successfully." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
