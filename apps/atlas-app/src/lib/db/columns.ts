import { numbers } from "./schema"

/**
 * All columns of `numbers` EXCEPT `accessTokenEncrypted`.
 * Use this for any query whose result is sent to the browser — the encrypted
 * OAuth token must never cross the Server → Client boundary.
 */
export const numberPublicColumns = {
  id: numbers.id,
  phoneNumber: numbers.phoneNumber,
  displayName: numbers.displayName,
  businessId: numbers.businessId,
  businessName: numbers.businessName,
  wabaId: numbers.wabaId,
  phoneNumberId: numbers.phoneNumberId,
  productSlug: numbers.productSlug,
  productName: numbers.productName,
  metaAppUsed: numbers.metaAppUsed,
  internalLabel: numbers.internalLabel,
  status: numbers.status,
  qualityRating: numbers.qualityRating,
  messagingTier: numbers.messagingTier,
  evolutionInstanceName: numbers.evolutionInstanceName,
  chatwootInboxId: numbers.chatwootInboxId,
  typebotId: numbers.typebotId,
  connectedAt: numbers.connectedAt,
  lastActivityAt: numbers.lastActivityAt,
  createdAt: numbers.createdAt,
  updatedAt: numbers.updatedAt,
}
