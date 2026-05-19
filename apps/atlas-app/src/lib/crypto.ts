import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"

function getKey(): Buffer {
  const key = process.env.ATLAS_ENCRYPTION_KEY
  if (!key) throw new Error("ATLAS_ENCRYPTION_KEY is not set")
  if (key.length !== 64) throw new Error("ATLAS_ENCRYPTION_KEY must be 64 hex chars (32 bytes)")
  return Buffer.from(key, "hex")
}

// Returns "iv:ciphertext:tag" (all hex-encoded)
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString("hex"), encrypted.toString("hex"), tag.toString("hex")].join(":")
}

export function decrypt(stored: string): string {
  const parts = stored.split(":")
  if (parts.length !== 3) throw new Error("Invalid encrypted value format")
  const [ivHex, encHex, tagHex] = parts
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivHex, "hex"),
  )
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]).toString("utf8")
}
