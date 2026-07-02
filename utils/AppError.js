// Thrown by services to signal an expected failure (bad input, not found, conflict, etc.)
// Controllers catch this and use statusCode/message directly instead of guessing a 500.
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
