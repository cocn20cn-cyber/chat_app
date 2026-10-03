export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file'

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  last_seen: string | null
  created_at: string
}

export interface Message {
  id: string
  sender_id: string
  receiver_id: string
  content: string | null
  message_type: MessageType
  file_path: string | null
  file_name: string | null
  file_size: number | null
  delivered_at: string | null
  seen_at: string | null
  created_at: string
  signed_url?: string | null
}

export interface MessageReceipt {
  id: string
  delivered_at: string | null
  seen_at: string | null
}

export interface CallRecord {
  id: string
  caller_id: string
  receiver_id: string
  status: 'ringing' | 'connected' | 'ended' | 'rejected' | 'failed'
  started_at: string
  ended_at: string | null
  duration: number | null
  offer_sdp?: RTCSessionDescriptionInit | null
  answer_sdp?: RTCSessionDescriptionInit | null
}

export interface Attachment {
  file: File
  type: Exclude<MessageType, 'text'>
  previewUrl?: string
}

export interface CallSignal {
  kind: 'offer' | 'answer' | 'candidate' | 'reject' | 'end'
  callId: string
  from: string
  to: string
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
  startedAt?: string
}

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ended' | 'error'
