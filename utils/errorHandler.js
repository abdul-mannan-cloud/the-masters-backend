import AppError from "./AppError.js";

// Central place to translate any caught error into an HTTP response.
// Keeps controllers to a one-line `catch (err) { return sendErrorResponse(res, err); }`.
const sendErrorResponse = (res, err) => {
  console.error(err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Unique index violation (race condition past a pre-check, or direct DB constraint)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {}).join(", ") || "field";
    return res
      .status(409)
      .json({ error: `Duplicate value for ${field}. Record already exists.` });
  }

  // Mongoose schema validation failed
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: messages.join(", ") });
  }

  // Malformed ObjectId reached the DB layer
  if (err.name === "CastError") {
    return res
      .status(400)
      .json({ error: `Invalid value for field: ${err.path}` });
  }

  return res.status(500).json({ error: "Internal server error" });
};

export default sendErrorResponse;
