/*
 * Stand-ins for the @standardnotes/snjs types the relay imports, so the
 * plugin does not depend on snjs (a large package) for type names only.
 * The relay never inspects these values beyond what is typed here.
 * Added for StandardNotes-Stave; not part of the upstream relay.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type UuidString = string
export type ContentType = string
export type AppDataField = string
export type MessageData = any
export type ItemContent = { appData?: Record<string, Record<string, any>>; [key: string]: any }
export type DecryptedTransferPayload<C extends ItemContent = ItemContent> = {
  uuid: UuidString
  content_type: ContentType
  content: C
  [key: string]: any
}
export type DecryptedItem = DecryptedTransferPayload
export type OutgoingItemMessagePayload = DecryptedTransferPayload
