import type { MessageData, UuidString } from '../snjs-types'
import { ComponentAction } from './ComponentAction'
import { MessagePayloadApi } from './MessagePayloadApi'
import { ComponentData } from './ComponentData'

export type MessagePayload = {
  action: ComponentAction
  data: MessageData
  componentData?: ComponentData
  messageId?: UuidString
  sessionKey?: UuidString
  api: MessagePayloadApi
  original?: MessagePayload
  callback?: (...params: any) => void
}
