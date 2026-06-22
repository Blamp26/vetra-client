import { useCallback, useEffect, useRef, useState } from 'react';
import type { Channel } from 'phoenix';
import { useAppStore } from '@/store';
import { WebRTCService, type WebRTCDiagnostics } from '../services/webrtcService';
import { callSignalingService, type OfferPayload } from '../services/callSignalingService';
import type { CallDiagnostics, CallStatus, UseCallReturn } from './useCall.types';

const EMPTY_CALL_DIAGNOSTICS: CallDiagnostics = {
    connectionState: 'unknown',
    iceConnectionState: 'unknown',
    iceGatheringState: 'unknown',
    signalingState: 'unknown',
    selectedLocalCandidateType: 'unknown',
};

const DIAGNOSTICS_POLL_INTERVAL_MS = 1500;

function shouldPollDiagnostics(): boolean {
    return import.meta.env.DEV && import.meta.env.VITE_WEBRTC_SHOW_DIAGNOSTICS === 'true';
}

function mapDiagnostics(diagnostics: WebRTCDiagnostics): CallDiagnostics {
    return {
        connectionState: diagnostics.connectionState,
        iceConnectionState: diagnostics.iceConnectionState,
        iceGatheringState: diagnostics.iceGatheringState,
        signalingState: diagnostics.signalingState,
        selectedLocalCandidateType: diagnostics.selectedCandidatePair?.localCandidateType ?? 'unknown',
    };
}

export function useCall(currentUserId: number): UseCallReturn {
    const socketManager = useAppStore((s) => s.socketManager);

    const [status, setStatus] = useState<CallStatus>('idle');
    const [remoteUserId, setRemoteUserId] = useState<number | null>(null);
    const [remoteUsername, setRemoteUsername] = useState<string | null>(null);
    const [callId, setCallId] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [seconds, setSeconds] = useState(0);
    const [diagnostics, setDiagnostics] = useState<CallDiagnostics>(EMPTY_CALL_DIAGNOSTICS);

    const callChannelRef = useRef<Channel | null>(null);
    const webrtcRef = useRef<WebRTCService | null>(null);
    const endedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const offerSdpRef = useRef<string | null>(null);
    const previousUserIdRef = useRef<number | null>(null);

    const clearCallState = useCallback(() => {
        if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
        endedTimerRef.current = null;
        webrtcRef.current?.hangUp();
        webrtcRef.current = null;
        callChannelRef.current = null;
        offerSdpRef.current = null;
        setStatus('idle');
        setRemoteUserId(null);
        setRemoteUsername(null);
        setCallId(null);
        setRemoteStream(null);
        setIsMuted(false);
        setSeconds(0);
        setDiagnostics(EMPTY_CALL_DIAGNOSTICS);
    }, []);

    const resetAfterDelay = useCallback(() => {
        if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
        setStatus('ended');
        endedTimerRef.current = setTimeout(() => {
            clearCallState();
        }, 2000);
    }, [clearCallState]);

    const handleOffer = useCallback((payload: OfferPayload) => {
        offerSdpRef.current = payload.sdp;
        setRemoteUserId((prev) => prev ?? payload.from_user_id);
        setRemoteUsername((prev) => prev ?? payload.from_username);
        setCallId((prev) => prev ?? payload.call_id ?? null);
        setStatus((prev) => prev === 'idle' ? 'ringing' : prev);
        callSignalingService.clearPendingOffer(payload);
    }, []);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === 'active') {
            interval = setInterval(() => {
                setSeconds((prev) => prev + 1);
            }, 1000);
        } else if (status !== 'ended') {
            setSeconds(0);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [status]);

    useEffect(() => {
        if (!shouldPollDiagnostics() || status !== 'active') return;

        const interval = setInterval(() => {
            void webrtcRef.current?.collectDiagnostics();
        }, DIAGNOSTICS_POLL_INTERVAL_MS);

        return () => {
            clearInterval(interval);
        };
    }, [status]);

    useEffect(() => {
        const previousUserId = previousUserIdRef.current;
        const userChanged =
            previousUserId !== null &&
            currentUserId > 0 &&
            previousUserId !== currentUserId;

        previousUserIdRef.current = currentUserId > 0 ? currentUserId : null;

        if (!socketManager || currentUserId <= 0 || userChanged) {
            clearCallState();
        }

        if (!socketManager || currentUserId <= 0) return;

        callSignalingService.initialize(socketManager.socket, socketManager.userChannel, currentUserId);
        callChannelRef.current = callSignalingService.getChannel();

        const unsubs = [
            callSignalingService.onAnswer((payload) => {
                webrtcRef.current?.handleAnswer(payload.sdp);
                setRemoteUsername(payload.from_username);
                setStatus('active');
            }),
            callSignalingService.onIceCandidate((payload) => {
                webrtcRef.current?.addIceCandidate(payload.candidate);
            }),
            callSignalingService.onHangUp(() => {
                webrtcRef.current?.hangUp();
                resetAfterDelay();
            }),
            callSignalingService.onIncomingCall((payload) => {
                console.log('[useCall] incoming_call received', payload);
                setStatus('ringing');
                setRemoteUserId(payload.from_user_id);
                setRemoteUsername(payload.from_username);
                setCallId(payload.call_id);
            }),
            callSignalingService.onOffer(handleOffer),
        ];

        const pendingOffer = callSignalingService.consumePendingOffer();
        if (pendingOffer) {
            handleOffer(pendingOffer);
        }

        return () => {
            callChannelRef.current = null;
            unsubs.forEach((unsub) => unsub());
            if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
        };
    }, [socketManager, currentUserId, clearCallState, handleOffer, resetAfterDelay]);

    const startCall = useCallback((targetUserId: number) => {
        console.log('[useCall] startCall -> targetUserId:', targetUserId, '| current status:', status);
        const channel = callChannelRef.current;
        if (!channel || status !== 'idle') return;

        if (targetUserId === currentUserId) {
            console.warn('[useCall] Cannot call yourself');
            return;
        }

        setStatus('calling');
        setRemoteUserId(targetUserId);

        const service = new WebRTCService(channel, currentUserId, targetUserId);
        service.onRemoteStream = (stream) => setRemoteStream(stream);
        service.onCallIdReceived = (nextCallId) => setCallId(nextCallId);
        service.onDiagnosticsChange = (nextDiagnostics) => setDiagnostics(mapDiagnostics(nextDiagnostics));
        webrtcRef.current = service;
        setDiagnostics(mapDiagnostics(service.getDiagnosticsSnapshot()));

        service.startCall()
            .then(() => {
                endedTimerRef.current = setTimeout(() => {
                    if (webrtcRef.current) {
                        console.warn('[useCall] Call timeout');
                        webrtcRef.current.hangUp();
                        resetAfterDelay();
                    }
                }, 30_000);
            })
            .catch((err) => {
                console.error('[useCall] startCall failed', err);
                resetAfterDelay();
            });
    }, [status, currentUserId, resetAfterDelay]);

    const acceptCall = useCallback(() => {
        const channel = callChannelRef.current;
        const remote = remoteUserId;
        if (!channel || !remote || status !== 'ringing') return;

        const sdp = offerSdpRef.current;
        if (!sdp) {
            console.warn('[useCall] acceptCall called before offer SDP received');
            return;
        }

        const service = new WebRTCService(channel, currentUserId, remote);
        service.onRemoteStream = (stream) => {
            setRemoteStream(stream);
        };
        service.onDiagnosticsChange = (nextDiagnostics) => setDiagnostics(mapDiagnostics(nextDiagnostics));

        webrtcRef.current = service;
        setStatus('active');
        offerSdpRef.current = null;
        setDiagnostics(mapDiagnostics(service.getDiagnosticsSnapshot()));

        service.acceptCall(sdp).catch((err) => {
            console.error('[useCall] acceptCall failed', err);
            resetAfterDelay();
        });
    }, [status, remoteUserId, currentUserId, resetAfterDelay]);

    const rejectCall = useCallback(() => {
        const channel = callChannelRef.current;
        if (channel && callId && remoteUserId) {
            channel.push('hang_up', { call_id: callId, to_user_id: remoteUserId });
        }
        offerSdpRef.current = null;
        resetAfterDelay();
    }, [callId, remoteUserId, resetAfterDelay]);

    const hangUp = useCallback(() => {
        const channel = callChannelRef.current;
        if (channel && callId && remoteUserId) {
            channel.push('hang_up', { call_id: callId, to_user_id: remoteUserId });
        }
        webrtcRef.current?.hangUp();
        offerSdpRef.current = null;
        resetAfterDelay();
    }, [callId, remoteUserId, resetAfterDelay]);

    const toggleMute = useCallback(() => {
        const service = webrtcRef.current;
        if (!service) return;

        const localStream: MediaStream | null = (service as unknown as { localStream: MediaStream | null }).localStream;
        if (!localStream) return;

        const audioTrack = localStream.getAudioTracks()[0];
        if (!audioTrack) return;

        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
    }, []);

    return {
        status,
        remoteUserId,
        remoteUsername,
        callId,
        isMuted,
        remoteStream,
        seconds,
        diagnostics,
        startCall,
        acceptCall,
        rejectCall,
        hangUp,
        toggleMute,
    };
}
