import crypto from "crypto";

// Encrypts sensitive per-tenant credentials (WhatsApp access tokens) at
// rest — AES-256-GCM, a fresh random IV per encryption, auth tag appended so
// tampering/corruption is detected on decrypt rather than silently producing
// garbage. Ciphertext is stored as one string: "iv:authTag:data", all
// base64 — a single column, no schema fan-out needed.
//
// Key: a dedicated CREDENTIAL_ENCRYPTION_KEY is preferred (set one in
// production). If it's absent, the key is derived from JWT_SECRET (which
// this app already requires to run at all) via scrypt, so local/dev
// environments work out of the box without a second secret to configure —
// but this is a fallback, not the recommended setup; see .env.
const getKey = () => {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "Cannot encrypt/decrypt credentials — neither CREDENTIAL_ENCRYPTION_KEY nor JWT_SECRET is set",
    );
  }
  return crypto.scryptSync(secret, "the-masters-credential-encryption", 32);
};

export const encryptCredential = (plaintext) => {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
};

export const decryptCredential = (ciphertext) => {
  if (!ciphertext) return null;
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return null; // malformed/legacy value — treat as unusable, not a crash
  const [ivB64, authTagB64, dataB64] = parts;
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getKey(),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    // Wrong key, corrupted value, or tampered auth tag — never throw a raw
    // crypto error up into a WhatsApp send failure message.
    return null;
  }
};
