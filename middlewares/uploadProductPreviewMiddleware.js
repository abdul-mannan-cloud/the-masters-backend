import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "the-masters/product-preview-layers",
    // No "svg" — Cloudinary's stream-based upload path (how multer feeds it
    // files) can't reliably sniff SVG content the way a direct path-based
    // upload can, and rejects it with a confusing "unknown file format"
    // error regardless of allowed_formats. Raster garment photos/exports
    // (png/jpg/webp) are the realistic asset type here anyway.
    allowed_formats: ["png", "jpg", "jpeg", "webp"],
    public_id: (req, file) =>
      `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, "")}`,
  },
});

// A single ProductType's preview upload carries an unknown, variable number
// of files (one base image + one per option value) whose field names are
// generated client-side (see previewLayerMeta in the frontend service) — so
// this uses upload.any() rather than a fixed .fields()/.single() list, with
// a generous but bounded file count to prevent an unbounded multipart body.
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 60 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed for preview layer upload"));
    }
    cb(null, true);
  },
});

export default upload;
