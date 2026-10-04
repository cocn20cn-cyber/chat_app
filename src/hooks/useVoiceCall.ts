import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { notifyPrivateRecipient } from '../lib/push'
import { createCall, getPendingIncomingCall, saveCallAnswer, saveCallOffer, updateCall } from '../services/chat'
import type { CallRecord, CallSignal, CallState } from '../types'

interface ActiveCall {
  id: string
  startedAt: string
  sdp?: RTCSessionDescriptionInit
}

const RING_TIMEOUT_MS = 60_000
const ICE_GATHER_TIMEOUT_MS = 4_000

function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
  if (import.meta.env.VITE_TURN_URL) {
    servers.push({ urls: import.meta.env.VITE_TURN_URL, username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_PASSWORD })
  }
  return servers
}

function descriptionFrom(peer: RTCPeerConnection): RTCSessionDescriptionInit {
  const description = peer.localDescription
  if (!description) throw new Error('Could not prepare the voice connection.')
  return { type: description.type, sdp: description.sdp }
}

async function waitForIceGathering(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === 'complete') return
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(done, ICE_GATHER_TIMEOUT_MS)
    function done() {
      window.clearTimeout(timeout)
      peer.removeEventListener('icegatheringstatechange', onStateChange)
      resolve()
    }
    function onStateChange() {
      if (peer.iceGatheringState === 'complete') done()
    }
    peer.addEventListener('icegatheringstatechange', onStateChange)
  })
}

export function useVoiceCall(myId: string, friendId: string, onIncomingCall?: () => void) {
  const [state, setState] = useState<CallState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [signalReady, setSignalReady] = useState(false)
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const activeCallRef = useRef<ActiveCall | null>(null)
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const disconnectedTimerRef = useRef<number | null>(null)
  const ringTimerRef = useRef<number | null>(null)
  const incomingCallbackRef = useRef(onIncomingCall)

  useEffect(() => { incomingCallbackRef.current = onIncomingCall }, [onIncomingCall])

  const sendSignal = useCallback((signal: CallSignal) => {
    const channel = channelRef.current
    if (!channel) throw new Error('Voice signaling is still connecting. Please try again in a moment.')
    void channel.send({ type: 'broadcast', event: 'call-signal', payload: signal })
  }, [])

  const stopMedia = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
    setIsMuted(false)
  }, [])

  const closePeer = useCallback(() => {
    if (disconnectedTimerRef.current) window.clearTimeout(disconnectedTimerRef.current)
    if (ringTimerRef.current) window.clearTimeout(ringTimerRef.current)
    const peer = peerRef.current
    if (peer) {
      peer.onicecandidate = null
      peer.ontrack = null
      peer.onconnectionstatechange = null
      peer.close()
    }
    peerRef.current = null
    queuedCandidatesRef.current = []
    pendingCandidatesRef.current.clear()
  }, [])

  const cleanUp = useCallback(() => {
    closePeer()
    stopMedia()
  }, [closePeer, stopMedia])

  const finish = useCallback((status: 'ended' | 'rejected' | 'failed', notifyFriend: boolean) => {
    const active = activeCallRef.current
    if (active && notifyFriend) {
      try {
        sendSignal({ kind: status === 'rejected' ? 'reject' : 'end', callId: active.id, from: myId, to: friendId })
      } catch {
        // Local cleanup still matters if the signaling socket was interrupted.
      }
    }
    cleanUp()
    if (active) void updateCall(active.id, status, active.startedAt).catch(() => undefined)
    activeCallRef.current = null
    setCallStartedAt(null)
    setState('ended')
  }, [cleanUp, friendId, myId, sendSignal])

  const armRingTimeout = useCallback((id: string, startedAt: string) => {
    if (ringTimerRef.current) window.clearTimeout(ringTimerRef.current)
    const elapsed = Date.now() - new Date(startedAt).getTime()
    const remaining = Math.max(1_000, RING_TIMEOUT_MS - elapsed)
    ringTimerRef.current = window.setTimeout(() => {
      if (activeCallRef.current?.id === id) {
        setError('No answer. The voice call has ended.')
        finish('failed', true)
      }
    }, remaining)
  }, [finish])

  const createPeer = useCallback((callId: string, startedAt: string, stream: MediaStream, saveDescription?: (description: RTCSessionDescriptionInit) => void) => {
    const peer = new RTCPeerConnection({ iceServers: getIceServers() })
    peerRef.current = peer
    stream.getTracks().forEach((track) => peer.addTrack(track, stream))
    peer.ontrack = (event) => {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0]
    }
    peer.onicecandidate = (event) => {
      if (!event.candidate) return
      try { saveDescription?.(descriptionFrom(peer)) } catch { /* A final SDP is also saved after ICE gathering. */ }
      try {
        sendSignal({ kind: 'candidate', callId, from: myId, to: friendId, candidate: event.candidate.toJSON() })
      } catch {
        // The complete SDP is stored below, so a late receiver can still answer.
      }
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        if (ringTimerRef.current) window.clearTimeout(ringTimerRef.current)
        setState('connected')
        void updateCall(callId, 'connected').catch(() => undefined)
      }
      if (peer.connectionState === 'failed') {
        setError('The voice connection failed. Please try the call again.')
        finish('failed', true)
      }
      if (peer.connectionState === 'disconnected') {
        if (disconnectedTimerRef.current) window.clearTimeout(disconnectedTimerRef.current)
        disconnectedTimerRef.current = window.setTimeout(() => {
          if (peer.connectionState === 'disconnected') {
            setError('The other person left the call or their connection was lost.')
            finish('ended', false)
          }
        }, 6_000)
      }
    }
    return peer
  }, [finish, friendId, myId, sendSignal])

  const addQueuedCandidates = useCallback(async (peer: RTCPeerConnection) => {
    const candidates = queuedCandidatesRef.current.splice(0)
    await Promise.all(candidates.map((candidate) => peer.addIceCandidate(new RTCIceCandidate(candidate))))
  }, [])

  const openIncomingCall = useCallback((record: Pick<CallRecord, 'id' | 'started_at' | 'offer_sdp'>) => {
    if (activeCallRef.current || !record.offer_sdp) return false
    activeCallRef.current = { id: record.id, startedAt: record.started_at, sdp: record.offer_sdp }
    queuedCandidatesRef.current = pendingCandidatesRef.current.get(record.id) ?? []
    pendingCandidatesRef.current.delete(record.id)
    setCallStartedAt(record.started_at)
    setError(null)
    setState('incoming')
    armRingTimeout(record.id, record.started_at)
    incomingCallbackRef.current?.()
    return true
  }, [armRingTimeout])

  const handleSignal = useCallback((signal: CallSignal) => {
    if (signal.to !== myId) return
    const active = activeCallRef.current
    if (signal.kind === 'offer') {
      if (active) {
        try { sendSignal({ kind: 'reject', callId: signal.callId, from: myId, to: signal.from }) } catch { /* ignored */ }
        return
      }
      if (!signal.sdp || !signal.startedAt) return
      openIncomingCall({ id: signal.callId, started_at: signal.startedAt, offer_sdp: signal.sdp })
      return
    }
    if (signal.kind === 'candidate' && signal.candidate) {
      if (!active || active.id !== signal.callId) {
        if (!active) {
          const queued = pendingCandidatesRef.current.get(signal.callId) ?? []
          queued.push(signal.candidate)
          pendingCandidatesRef.current.set(signal.callId, queued)
        }
        return
      }
      const peer = peerRef.current
      if (peer?.remoteDescription) {
        void peer.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => undefined)
      } else {
        queuedCandidatesRef.current.push(signal.candidate)
      }
      return
    }
    if (!active || active.id !== signal.callId) return
    if (signal.kind === 'answer' && signal.sdp && peerRef.current) {
      void peerRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp))
        .then(() => addQueuedCandidates(peerRef.current as RTCPeerConnection))
        .catch(() => void finish('failed', true))
      return
    }
    if (signal.kind === 'reject') finish('rejected', false)
    if (signal.kind === 'end') finish('ended', false)
  }, [addQueuedCandidates, finish, myId, openIncomingCall, sendSignal])

  useEffect(() => {
    const channel = supabase
      .channel('two-person-call-signaling', { config: { private: true, broadcast: { self: false, ack: true } } })
      .on('broadcast', { event: 'call-signal' }, ({ payload }) => handleSignal(payload as CallSignal))
      .subscribe((status) => {
        const ready = status === 'SUBSCRIBED'
        setSignalReady(ready)
        if (!ready) return
        void getPendingIncomingCall(myId)
          .then((record) => { if (record) openIncomingCall(record) })
          .catch(() => undefined)
      })
    channelRef.current = channel
    return () => {
      void supabase.removeChannel(channel)
      channelRef.current = null
      cleanUp()
    }
  }, [cleanUp, handleSignal, myId, openIncomingCall])

  const startCall = useCallback(async () => {
    if (!signalReady) {
      setError('Voice signaling is connecting. Please try again in a moment.')
      return
    }
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const callId = crypto.randomUUID()
      const record = await createCall(myId, friendId, callId)
      activeCallRef.current = { id: callId, startedAt: record.started_at }
      setCallStartedAt(record.started_at)
      armRingTimeout(callId, record.started_at)
      const peer = createPeer(callId, record.started_at, stream, (description) => {
        void saveCallOffer(callId, description).catch(() => undefined)
      })
      setState('outgoing')
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      const initialOffer = descriptionFrom(peer)
      await saveCallOffer(callId, initialOffer)
      sendSignal({ kind: 'offer', callId, from: myId, to: friendId, sdp: initialOffer, startedAt: record.started_at })
      void notifyPrivateRecipient(friendId, 'call')
      void waitForIceGathering(peer)
        .then(() => saveCallOffer(callId, descriptionFrom(peer)))
        .catch(() => undefined)
    } catch (reason) {
      cleanUp()
      activeCallRef.current = null
      setCallStartedAt(null)
      setState('error')
      setError(reason instanceof DOMException && reason.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow microphone access and try again.'
        : 'Could not start the voice call. Please check your connection and try again.')
    }
  }, [armRingTimeout, cleanUp, createPeer, friendId, myId, sendSignal, signalReady])

  const acceptCall = useCallback(async () => {
    const active = activeCallRef.current
    if (!active?.sdp) return
    try {
      setError(null)
      setState('connecting')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const peer = createPeer(active.id, active.startedAt, stream, (description) => {
        void saveCallAnswer(active.id, description).catch(() => undefined)
      })
      await peer.setRemoteDescription(new RTCSessionDescription(active.sdp))
      await addQueuedCandidates(peer)
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      const initialAnswer = descriptionFrom(peer)
      await saveCallAnswer(active.id, initialAnswer)
      sendSignal({ kind: 'answer', callId: active.id, from: myId, to: friendId, sdp: initialAnswer })
      void waitForIceGathering(peer)
        .then(() => saveCallAnswer(active.id, descriptionFrom(peer)))
        .catch(() => undefined)
    } catch (reason) {
      setError(reason instanceof DOMException && reason.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow microphone access and accept the call again.'
        : 'Could not connect the call. Please try again.')
      finish('failed', true)
    }
  }, [addQueuedCandidates, createPeer, finish, friendId, myId, sendSignal])

  const rejectCall = useCallback(() => finish('rejected', true), [finish])
  const endCall = useCallback(() => finish('ended', true), [finish])
  const dismiss = useCallback(() => {
    cleanUp()
    activeCallRef.current = null
    setCallStartedAt(null)
    setError(null)
    setState('idle')
  }, [cleanUp])
  const toggleMute = useCallback(() => {
    const next = !isMuted
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next })
    setIsMuted(next)
  }, [isMuted])

  return { state, error, isMuted, signalReady, callStartedAt, remoteAudioRef, startCall, acceptCall, rejectCall, endCall, dismiss, toggleMute }
}
