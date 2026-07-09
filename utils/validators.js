// Shared validation/normalization helpers — every service must use these
// instead of hand-rolling its own regex, so the rules stay identical
// everywhere (and the frontend's formatting can never be trusted as-is).
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pakistani mobile numbers: 11 digits, always starting "03" (landlines and
// other formats are out of scope — every phone field in this app is a
// contact/mobile number).
const PHONE_REGEX = /^03\d{9}$/;

// NADRA CNIC: exactly 13 digits, no dashes (dashes are a display concern only).
const CNIC_REGEX = /^\d{13}$/;

export const normalizeDigits = (value) => (value ?? "").toString().replace(/\D/g, "");

export const isValidPhone = (digits) => PHONE_REGEX.test(digits);
export const isValidCnic = (digits) => CNIC_REGEX.test(digits);
export const isValidEmail = (value) => EMAIL_REGEX.test(value);
