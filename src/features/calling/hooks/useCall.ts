import { useCallback, useEffect, useRef, useState } from 'react';
import type { Channel } from 'phoenix';
import { useAppStore } from '@/store';
import type { ResourceRef } from '@/shared/types';
import { WebRTCService, type WebRTCDiagnostics } from '../services/webrtcService';
import { callSignalingService, type OfferPayload } from '../services/callSignalingService';
import type { CallDiagnostics, CallIssue, CallServiceStatus, CallStatus, UseCallReturn } from './useCall.types';
import { debugCall } from '../utils/callDebug';

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

function sameResourceRef(a: ResourceRef | null | undefined, b: ResourceRef | null | undefined): boolean {
    return a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
}

function canonicalCallUserId(currentRef: ResourceRef | null | undefined, nextUserId: ResourceRef): ResourceRef {
    if (typeof nextUserId === 'number') return nextUserId;
    return currentRef ?? nextUserId;
}

function isExpectedScreenShareCancellation(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return (
        error.message === 'Screen share start was superseded by stop' ||
        error.message === 'Screen share stopped because the peer was disposed'
    );
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return String(error ?? 'unknown error');
}

function getErrorName(error: unknown): string {
    if (error instanceof DOMException || error instanceof Error) {
        return error.name;
    }

    return '';
}

function isPermissionDeniedError(error: unknown): boolean {
    const name = getErrorName(error);
    const message = getErrorMessage(error).toLowerCase();

    return (
        name === 'NotAllowedError' ||
        name === 'SecurityError' ||
        message.includes('permission denied') ||
        message.includes('permission dismissed') ||
        message.includes('denied permission')
    );
}

function isUnavailableDeviceError(error: unknown): boolean {
    const name = getErrorName(error);
    const message = getErrorMessage(error).toLowerCase();

    return (
        name === 'NotFoundError' ||
        name === 'OverconstrainedError' ||
        message.includes('no mic') ||
        message.includes('device not found') ||
        message.includes('requested device not found') ||
        message.includes('could not start audio source') ||
        message.includes('not available')
    );
}

function isTimedOutError(error: unknown): boolean {
    return getErrorMessage(error).toLowerCase().includes('timed out');
}

function isUnavailableRemoteError(error: unknown): boolean {
    const message = getErrorMessage(error).toLowerCase();
    return (
        message.includes('not_found') ||
        message.includes('offline') ||
        message.includes('unavailable')
    );
}

function isRemoteCallServiceNotReadyError(error: unknown): boolean {
    return getErrorMessage(error).toLowerCase().includes('remote_call_service_not_ready');
}

function isAlreadyInCallError(error: unknown): boolean {
    return getErrorMessage(error).toLowerCase().includes('already_in_call');
}

function buildCallIssue(message: string, tone: CallIssue['tone'] = 'error'): CallIssue {
    return { tone, message };
}

function mapStartCallIssue(error: unknown): CallIssue {
    if (isRemoteCallServiceNotReadyError(error)) {
        return buildCallIssue('User is not ready to receive calls yet. Try again in a moment.');
    }

    if (isAlreadyInCallError(error)) {
        return buildCallIssue('Call could not start because one side is already in a call.');
    }

    if (isPermissionDeniedError(error)) {
        return buildCallIssue('Microphone permission denied.');
    }

    if (isUnavailableDeviceError(error)) {
        return buildCallIssue('Microphone unavailable.');
    }

    if (isUnavailableRemoteError(error)) {
        return buildCallIssue('User unavailable. Try again later.');
    }

    if (isTimedOutError(error)) {
        return buildCallIssue('Call timed out. No answer.');
    }

    return buildCallIssue('Call failed. Please try again.');
}

function mapAcceptCallIssue(error: unknown): CallIssue {
    if (isPermissionDeniedError(error)) {
        return buildCallIssue('Microphone permission denied.');
    }

    if (isUnavailableDeviceError(error)) {
        return buildCallIssue('Microphone unavailable.');
    }

    if (isTimedOutError(error)) {
        return buildCallIssue('Connecting timed out. Please try again.');
    }

    return buildCallIssue('Could not connect the call.');
}

function mapScreenShareIssue(error: unknown): CallIssue {
    const message = getErrorMessage(error).toLowerCase();

    if (message.includes('not supported')) {
        return buildCallIssue('Screen sharing is not supported in this browser.');
    }

    if (isPermissionDeniedError(error)) {
        return buildCallIssue('Screen share permission denied.');
    }

    if (isTimedOutError(error)) {
        return buildCallIssue('Screen share update timed out. Try again.');
    }

    if (message.includes('screen share did not provide a video track')) {
        return buildCallIssue('Screen share failed. No video track was provided.');
    }

    return buildCallIssue('Screen share failed. Please try again.');
}

export function useCall(currentUserId: number): UseCallReturn {
    const socketManager = useAppStore((s) => s.socketManager);
    const currentUserCallRef = useAppStore((s) => s.currentUser?.public_id ?? s.currentUser?.id ?? null);

    const [status, setStatus] = useState<CallStatus>('idle');
    const [remoteUserId, setRemoteUserId] = useState<ResourceRef | null>(null);
    const [remoteUsername, setRemoteUsername] = useState<string | null>(null);
    const [callId, setCallId] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isScreenShareUpdating, setIsScreenShareUpdating] = useState(false);
    const [isRemoteScreenLoading, setIsRemoteScreenLoading] = useState(false);
    const [isRemoteScreenAvailable, setIsRemoteScreenAvailable] = useState(false);
    const [isWatchingRemoteScreen, setIsWatchingRemoteScreen] = useState(false);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
    const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
    const [seconds, setSeconds] = useState(0);
    const [diagnostics, setDiagnostics] = useState<CallDiagnostics>(EMPTY_CALL_DIAGNOSTICS);
    const [callIssue, setCallIssue] = useState<CallIssue | null>(null);
    const [isIncomingActionPending, setIsIncomingActionPending] = useState(false);
    const [callServiceStatus, setCallServiceStatus] = useState<CallServiceStatus>(
        callSignalingService.getReadinessStatus(),
    );

    const callChannelRef = useRef<Channel | null>(null);
    const webrtcRef = useRef<WebRTCService | null>(null);
    const endedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const signalingUnsubsRef = useRef<Array<() => void>>([]);
    const offerSdpRef = useRef<string | null>(null);
    const statusRef = useRef<CallStatus>('idle');
    const callIdRef = useRef<string | null>(null);
    const remoteUserIdRef = useRef<ResourceRef | null>(null);
    const hangUpSentRef = useRef(false);
    const previousUserIdRef = useRef<number | null>(null);
    const previousSocketManagerRef = useRef<typeof socketManager>(null);
    const latestUserCallRefRef = useRef<ResourceRef | null>(null);
    const teardownCallRef = useRef<(() => void) | null>(null);
    const localScreenStreamRef = useRef<MediaStream | null>(null);
    const screenTrackRef = useRef<MediaStreamTrack | null>(null);
    const screenTrackEndedHandlerRef = useRef<(() => void) | null>(null);
    const incomingActionPendingRef = useRef(false);

    const cleanupScreenShare = useCallback((options?: { stopTracks?: boolean }) => {
        const shouldStopTracks = options?.stopTracks ?? true;
        const existingStream = localScreenStreamRef.current;
        const existingTrack = screenTrackRef.current;
        const existingHandler = screenTrackEndedHandlerRef.current;

        localScreenStreamRef.current = null;
        screenTrackRef.current = null;
        screenTrackEndedHandlerRef.current = null;
        setLocalScreenStream(null);
        setIsScreenSharing(false);

        if (existingTrack && existingHandler) {
            if ('removeEventListener' in existingTrack) {
                existingTrack.removeEventListener?.('ended', existingHandler);
            }
            existingTrack.onended = null;
        }

        if (shouldStopTracks && existingStream) {
            existingStream.getTracks().forEach((track) => {
                track.stop();
            });
        }
    }, []);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        callIdRef.current = callId;
    }, [callId]);

    useEffect(() => {
        remoteUserIdRef.current = remoteUserId;
    }, [remoteUserId]);

    const stopScreenShare = useCallback(() => {
        const service = webrtcRef.current;
        debugCall('[useCall] app stop sharing clicked', {
            has_service: Boolean(service),
            has_local_stream: Boolean(localScreenStreamRef.current),
            signalingState: service?.getDiagnosticsSnapshot().signalingState,
        });
        void service?.stopScreenShare().then(() => {
            setCallIssue(null);
        }).catch((err) => {
            console.warn('[useCall] Failed to stop transmitted screen share', err);
            setCallIssue(mapScreenShareIssue(err));
        });
        cleanupScreenShare({ stopTracks: !service });
    }, [cleanupScreenShare]);

    const clearCallTimeout = useCallback(() => {
        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
        }
    }, []);

    const teardownCall = useCallback((options?: { resetState?: boolean; unsubscribe?: boolean }) => {
        const resetState = options?.resetState ?? true;
        const unsubscribe = options?.unsubscribe ?? true;

        if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
        endedTimerRef.current = null;
        clearCallTimeout();
        if (unsubscribe) {
            signalingUnsubsRef.current.forEach((unsub) => unsub());
            signalingUnsubsRef.current = [];
        }
        cleanupScreenShare({ stopTracks: !webrtcRef.current });
        webrtcRef.current?.dispose();
        webrtcRef.current = null;
        callChannelRef.current = null;
        offerSdpRef.current = null;
        incomingActionPendingRef.current = false;
        if (resetState) {
            statusRef.current = 'idle';
            setStatus('idle');
            setRemoteUserId(null);
            setRemoteUsername(null);
            setCallId(null);
            setRemoteStream(null);
            setRemoteScreenStream(null);
            setIsRemoteScreenAvailable(false);
            setIsWatchingRemoteScreen(false);
            setIsScreenShareUpdating(false);
            setIsRemoteScreenLoading(false);
            setIsMuted(false);
            setIsScreenSharing(false);
            setLocalScreenStream(null);
            setSeconds(0);
            setDiagnostics(EMPTY_CALL_DIAGNOSTICS);
            setCallIssue(null);
            setIsIncomingActionPending(false);
        }
    }, [cleanupScreenShare, clearCallTimeout]);

    const cleanupLocalCall = useCallback((reason: string, options?: { issue?: CallIssue | null }) => {
        debugCall('[useCall] cleanup local call', {
            reason,
            call_id: callIdRef.current,
            remote_user_id: remoteUserIdRef.current,
            status: statusRef.current,
        });

        if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
        endedTimerRef.current = null;
        clearCallTimeout();
        cleanupScreenShare({ stopTracks: !webrtcRef.current });
        webrtcRef.current?.dispose();
        webrtcRef.current = null;
        offerSdpRef.current = null;
        incomingActionPendingRef.current = false;

        statusRef.current = 'idle';
        setStatus('idle');
        setRemoteUserId(null);
        setRemoteUsername(null);
        setCallId(null);
        setRemoteStream(null);
        setRemoteScreenStream(null);
        setIsRemoteScreenAvailable(false);
        setIsWatchingRemoteScreen(false);
        setIsScreenShareUpdating(false);
        setIsRemoteScreenLoading(false);
        setIsMuted(false);
        setIsScreenSharing(false);
        setLocalScreenStream(null);
        setSeconds(0);
        setDiagnostics(EMPTY_CALL_DIAGNOSTICS);
        setCallIssue(options?.issue ?? null);
        setIsIncomingActionPending(false);
    }, [cleanupScreenShare, clearCallTimeout]);

    const resetAfterDelay = useCallback((options?: { status?: 'ended' | 'failed'; issue?: CallIssue | null }) => {
        if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
        const nextStatus = options?.status ?? 'ended';
        statusRef.current = nextStatus;
        setStatus(nextStatus);
        setCallIssue(options?.issue ?? null);
        endedTimerRef.current = setTimeout(() => {
            teardownCall();
        }, 2000);
    }, [teardownCall]);

    const handleOffer = useCallback((payload: OfferPayload) => {
        debugCall('[useCall] receive offer', {
            event: 'offer',
            call_id: payload.call_id,
            active_call_id: callIdRef.current,
            status: statusRef.current,
            signalingState: webrtcRef.current?.getDiagnosticsSnapshot().signalingState,
        });
        offerSdpRef.current = payload.sdp;
        setCallIssue(null);
        setIsIncomingActionPending(false);
        incomingActionPendingRef.current = false;
        setRemoteUserId((prev) => canonicalCallUserId(prev, payload.from_user_id));
        setRemoteUsername((prev) => prev ?? payload.from_username);
        setCallId((prev) => prev ?? payload.call_id ?? null);
        const service = webrtcRef.current;
        if (payload.call_id) {
            service?.setCallId(payload.call_id);
        }
        setStatus((prev) => {
            if (prev === 'active' && service) {
                debugCall('[useCall] renegotiation offer received', {
                    call_id: payload.call_id,
                    active_call_id: callIdRef.current,
                });
                service.handleOffer(payload.sdp).catch((err) => {
                    console.error('[useCall] renegotiation offer failed', err);
                });
                return prev;
            }
            return prev === 'idle' ? 'ringing' : prev;
        });
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
        teardownCallRef.current = () => {
            teardownCall();
            callSignalingService.disconnect();
        };
    }, [teardownCall]);

    useEffect(() => {
        if (currentUserId > 0) {
            latestUserCallRefRef.current = currentUserCallRef ?? currentUserId;
            return;
        }

        latestUserCallRefRef.current = null;
    }, [currentUserCallRef, currentUserId]);

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
        if (status === 'active') {
            clearCallTimeout();
        }
    }, [status, clearCallTimeout]);

    useEffect(() => {
        return () => {
            teardownCallRef.current?.();
        };
    }, []);

    useEffect(() => {
        const previousUserId = previousUserIdRef.current;
        const previousSocketManager = previousSocketManagerRef.current;
        const userChanged =
            previousUserId !== null &&
            currentUserId > 0 &&
            previousUserId !== currentUserId;
        const socketChanged =
            previousSocketManager !== null &&
            previousSocketManager !== socketManager;

        previousUserIdRef.current = currentUserId > 0 ? currentUserId : null;
        previousSocketManagerRef.current = socketManager;

        if (!socketManager || currentUserId <= 0 || userChanged || socketChanged) {
            latestUserCallRefRef.current = null;
            teardownCall();
            callSignalingService.disconnect();
        }

        if (!socketManager || currentUserId <= 0) return;

        callSignalingService.initialize(
            socketManager.socket,
            socketManager.userChannel,
            currentUserId,
            latestUserCallRefRef.current ?? currentUserId,
        );
        callChannelRef.current = callSignalingService.getChannel();
        setCallServiceStatus(callSignalingService.getReadinessStatus());

        signalingUnsubsRef.current.forEach((unsub) => unsub());
        const unsubs = [
            callSignalingService.onReadinessChange((nextStatus) => {
                callChannelRef.current = callSignalingService.getChannel();
                setCallServiceStatus(nextStatus);
            }),
            callSignalingService.onAnswer((payload) => {
                clearCallTimeout();
                debugCall('[useCall] receive answer', {
                    call_id: payload.call_id,
                    active_call_id: callIdRef.current,
                    signalingState: webrtcRef.current?.getDiagnosticsSnapshot().signalingState,
                });
                if ('call_id' in payload && typeof payload.call_id === 'string') {
                    const nextCallId = payload.call_id;
                    setCallId((prev) => prev ?? nextCallId);
                    webrtcRef.current?.setCallId(nextCallId);
                }
                setRemoteUserId((prev) => canonicalCallUserId(prev, payload.from_user_id));
                setCallIssue(null);
                webrtcRef.current?.handleAnswer(payload.sdp).catch((err) => {
                    console.error('[useCall] initial answer failed', err);
                    resetAfterDelay({ status: 'failed', issue: mapAcceptCallIssue(err) });
                });
                setRemoteUsername((prev) => payload.from_username ?? prev);
                statusRef.current = 'active';
                setStatus('active');
            }),
            callSignalingService.onIceCandidate((payload) => {
                debugCall('[useCall] receive ICE', {
                    call_id: payload.call_id,
                    active_call_id: callIdRef.current,
                    signalingState: webrtcRef.current?.getDiagnosticsSnapshot().signalingState,
                });
                webrtcRef.current?.addIceCandidate(payload.candidate);
            }),
            callSignalingService.onRenegotiation((payload) => {
                debugCall('[useCall] receive renegotiation', {
                    call_id: payload.call_id,
                    active_call_id: callIdRef.current,
                    from_user_id: payload.from_user_id,
                    type: payload.type,
                    screen_share_active: payload.screen_share_active,
                    signalingState: webrtcRef.current?.getDiagnosticsSnapshot().signalingState,
                });
                const activeCallId = callIdRef.current ?? webrtcRef.current?.getSignalingCallId() ?? null;
                const remoteMatches = sameResourceRef(payload.from_user_id, remoteUserIdRef.current);
                const callMatches = Boolean(payload.call_id && activeCallId && payload.call_id === activeCallId);

                if (!remoteMatches && !callMatches) {
                    debugCall('[useCall] renegotiation skipped', {
                        reason: 'remote_and_call_mismatch',
                        call_id: payload.call_id,
                        active_call_id: activeCallId,
                        from_user_id: payload.from_user_id,
                        active_remote_user_id: remoteUserIdRef.current,
                        type: payload.type,
                    });
                    return;
                }
                if (payload.call_id && activeCallId && payload.call_id !== activeCallId) {
                    debugCall('[useCall] renegotiation skipped', {
                        reason: 'call_mismatch',
                        call_id: payload.call_id,
                        active_call_id: activeCallId,
                        type: payload.type,
                    });
                    return;
                }
                setRemoteUserId((prev) => canonicalCallUserId(prev, payload.from_user_id));
                if (payload.call_id) {
                    setCallId((prev) => prev ?? payload.call_id ?? null);
                    webrtcRef.current?.setCallId(payload.call_id);
                }
                webrtcRef.current?.handleRenegotiation(payload).then(() => {
                    setCallIssue(null);
                }).catch((err) => {
                    console.error('[useCall] renegotiation failed', err);
                    setCallIssue(mapScreenShareIssue(err));
                });
            }),
            callSignalingService.onHangUp((payload) => {
                const activeCallId = callIdRef.current ?? webrtcRef.current?.getSignalingCallId() ?? null;
                const activeRemoteUserId = remoteUserIdRef.current;
                if (!sameResourceRef(payload.from_user_id, activeRemoteUserId)) {
                    debugCall('[useCall] hang_up ignored', {
                        reason: 'remote_mismatch',
                        call_id: payload.call_id,
                        active_call_id: activeCallId,
                        from_user_id: payload.from_user_id,
                        active_remote_user_id: activeRemoteUserId,
                    });
                    return;
                }
                if (payload.call_id && activeCallId && payload.call_id !== activeCallId) {
                    debugCall('[useCall] hang_up ignored', {
                        reason: 'call_mismatch',
                        call_id: payload.call_id,
                        active_call_id: activeCallId,
                    });
                    return;
                }
                debugCall('[useCall] hang_up received', {
                    call_id: payload.call_id,
                    from_user_id: payload.from_user_id,
                    active_call_id: callIdRef.current,
                    status: statusRef.current,
                    accepted: true,
                    reason: 'active_or_recent_call_context',
                });
                cleanupLocalCall('remote_hang_up');
            }),
            callSignalingService.onIncomingCall((payload) => {
                debugCall('[useCall] incoming_call received', { ...payload });
                statusRef.current = 'ringing';
                setStatus('ringing');
                setCallIssue(null);
                setIsIncomingActionPending(false);
                incomingActionPendingRef.current = false;
                setRemoteUserId(payload.from_user_id);
                setRemoteUsername(payload.from_username);
                setCallId(payload.call_id);
            }),
            callSignalingService.onOffer(handleOffer),
            callSignalingService.onChannelClose((payload) => {
                if (statusRef.current === 'idle') return;
                cleanupLocalCall('call_channel_closed', {
                    issue: buildCallIssue(
                        payload.reason === 'error'
                            ? 'Call ended because the call connection was lost.'
                            : 'Call ended because the call channel closed.',
                    ),
                });
            }),
        ];
        signalingUnsubsRef.current = unsubs;

        const pendingOffer = callSignalingService.consumePendingOffer();
        if (pendingOffer) {
            handleOffer(pendingOffer);
        }

        return () => {
            unsubs.forEach((unsub) => unsub());
            if (signalingUnsubsRef.current === unsubs) {
                signalingUnsubsRef.current = [];
            }
        };
    }, [cleanupLocalCall, cleanupScreenShare, clearCallTimeout, socketManager, currentUserId, handleOffer, resetAfterDelay, teardownCall]);

    const startCall = useCallback((targetUserId: ResourceRef, targetUsername?: string) => {
        const channel = callChannelRef.current;
        if (!channel) {
            debugCall('[useCall] startCall skipped', {
                reason: 'call_channel_not_ready',
                targetUserId,
                status: statusRef.current,
            });
            cleanupLocalCall('call_channel_missing', {
                issue: buildCallIssue('Call service is connecting. Try again in a moment.'),
            });
            return;
        }

        if (!callSignalingService.isReady()) {
            debugCall('[useCall] startCall skipped', {
                reason: 'call_channel_not_joined',
                targetUserId,
                status: statusRef.current,
            });
            cleanupLocalCall('call_channel_not_joined', {
                issue: buildCallIssue('Call service is connecting. Try again in a moment.'),
            });
            return;
        }

        if (statusRef.current !== 'idle') {
            debugCall('[useCall] startCall skipped', {
                reason: 'status_not_idle',
                targetUserId,
                status: statusRef.current,
                activeCallId: callIdRef.current,
            });
            return;
        }

        if (typeof targetUserId === 'number' && targetUserId === currentUserId) {
            console.warn('[useCall] Cannot call yourself');
            return;
        }

        statusRef.current = 'calling';
        hangUpSentRef.current = false;
        setStatus('calling');
        setCallIssue(null);
        setRemoteUserId(targetUserId);
        setRemoteUsername(targetUsername ?? null);

        const service = new WebRTCService(channel, currentUserId, targetUserId);
        service.onRemoteStream = (stream) => setRemoteStream(stream);
        service.onRemoteScreenStream = (stream) => setRemoteScreenStream(stream);
        service.onRemoteScreenAvailabilityChange = (available) => setIsRemoteScreenAvailable(available);
        service.onRemoteScreenWatchStateChange = (watching) => setIsWatchingRemoteScreen(watching);
        service.onRemoteScreenLoading = (loading) => setIsRemoteScreenLoading(loading);
        service.onScreenShareUpdatingChange = (updating) => setIsScreenShareUpdating(updating);
        service.onCallIdReceived = (nextCallId) => {
            service.setCallId(nextCallId);
            setCallId(nextCallId);
        };
        service.onDiagnosticsChange = (nextDiagnostics) => setDiagnostics(mapDiagnostics(nextDiagnostics));
        webrtcRef.current = service;
        setDiagnostics(mapDiagnostics(service.getDiagnosticsSnapshot()));

        service.startCall()
            .then(() => {
                callTimeoutRef.current = setTimeout(() => {
                    if (webrtcRef.current) {
                        console.warn('[useCall] Call timeout');
                        cleanupLocalCall('outgoing_call_timeout', {
                            issue: buildCallIssue('Call timed out. No answer.'),
                        });
                    }
                }, 30_000);
            })
            .catch((err) => {
                const issue = mapStartCallIssue(err);
                if (isAlreadyInCallError(err)) {
                    debugCall('[useCall] startCall rejected because a participant is already in a call', {
                        targetUserId,
                    });
                    cleanupLocalCall('offer_rejected_already_in_call', { issue });
                    return;
                }

                console.error('[useCall] startCall failed', err);
                cleanupLocalCall('start_call_failed', { issue });
            });
    }, [cleanupLocalCall, currentUserId]);

    const acceptCall = useCallback(() => {
        const channel = callChannelRef.current;
        const remote = remoteUserId;
        if (!channel || !remote || statusRef.current !== 'ringing' || incomingActionPendingRef.current) return;

        const sdp = offerSdpRef.current;
        if (!sdp) {
            console.warn('[useCall] acceptCall called before offer SDP received');
            return;
        }

        incomingActionPendingRef.current = true;
        hangUpSentRef.current = false;
        setIsIncomingActionPending(true);
        setCallIssue(null);

        const service = new WebRTCService(channel, currentUserId, remote);
        service.setCallId(callId);
        service.onRemoteStream = (stream) => {
            setRemoteStream(stream);
        };
        service.onRemoteScreenStream = (stream) => {
            setRemoteScreenStream(stream);
        };
        service.onRemoteScreenAvailabilityChange = (available) => setIsRemoteScreenAvailable(available);
        service.onRemoteScreenWatchStateChange = (watching) => setIsWatchingRemoteScreen(watching);
        service.onRemoteScreenLoading = (loading) => setIsRemoteScreenLoading(loading);
        service.onScreenShareUpdatingChange = (updating) => setIsScreenShareUpdating(updating);
        service.onDiagnosticsChange = (nextDiagnostics) => setDiagnostics(mapDiagnostics(nextDiagnostics));

        webrtcRef.current = service;
        clearCallTimeout();
        statusRef.current = 'active';
        setStatus('active');
        offerSdpRef.current = null;
        setDiagnostics(mapDiagnostics(service.getDiagnosticsSnapshot()));

        service.acceptCall(sdp).then(() => {
            setIsIncomingActionPending(false);
            incomingActionPendingRef.current = false;
            setCallIssue(null);
        }).catch((err) => {
            console.error('[useCall] acceptCall failed', err);
            cleanupLocalCall('accept_call_failed', { issue: mapAcceptCallIssue(err) });
        });
    }, [callId, clearCallTimeout, status, remoteUserId, currentUserId, cleanupLocalCall]);

    const rejectCall = useCallback(() => {
        const channel = callChannelRef.current;
        if (statusRef.current !== 'ringing') return;
        if (incomingActionPendingRef.current) return;
        incomingActionPendingRef.current = true;
        setIsIncomingActionPending(true);
        if (channel && callId && remoteUserId) {
            channel.push('hang_up', { call_id: callId, to_user_id: remoteUserId });
        }
        offerSdpRef.current = null;
        cleanupLocalCall('reject_call');
    }, [callId, cleanupLocalCall, remoteUserId]);

    const hangUp = useCallback(() => {
        const channel = callChannelRef.current;
        const activeCallId = callIdRef.current ?? webrtcRef.current?.getSignalingCallId() ?? null;
        const activeRemoteUserId = remoteUserIdRef.current;
        if (!hangUpSentRef.current && channel && activeCallId && activeRemoteUserId) {
            hangUpSentRef.current = true;
            debugCall('[useCall] hang_up sent', {
                call_id: activeCallId,
                to_user_id: activeRemoteUserId,
                status: statusRef.current,
            });
            channel.push('hang_up', { call_id: activeCallId, to_user_id: activeRemoteUserId });
        } else {
            debugCall('[useCall] hang_up not sent', {
                reason: hangUpSentRef.current ? 'already_sent' : 'missing_context',
                call_id: activeCallId,
                to_user_id: activeRemoteUserId,
                status: statusRef.current,
            });
        }
        cleanupLocalCall('local_hang_up');
    }, [cleanupLocalCall]);

    const toggleMute = useCallback(() => {
        const service = webrtcRef.current;
        if (!service) return;

        const nextMuted = service.toggleLocalMuted();
        setIsMuted(nextMuted);
    }, []);

    const startScreenShare = useCallback(async () => {
        const mediaDevices = navigator.mediaDevices;
        if (!mediaDevices || typeof mediaDevices.getDisplayMedia !== 'function') {
            console.warn('[useCall] Screen sharing is not supported in this environment');
            setCallIssue(buildCallIssue('Screen sharing is not supported in this browser.'));
            return;
        }

        try {
            const service = webrtcRef.current;
            cleanupScreenShare({ stopTracks: !service });
            const stream = service
                ? await service.startScreenShare(() => {
                    cleanupScreenShare({ stopTracks: false });
                })
                : await mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false,
                });
            const videoTrack = stream.getVideoTracks()[0] ?? null;
            const handleEnded = () => {
                cleanupScreenShare({ stopTracks: false });
            };

            if (videoTrack && !service) {
                if ('addEventListener' in videoTrack) {
                    videoTrack.addEventListener?.('ended', handleEnded);
                }
                videoTrack.onended = handleEnded;
            }

            screenTrackRef.current = videoTrack;
            screenTrackEndedHandlerRef.current = service ? null : handleEnded;
            localScreenStreamRef.current = stream;
            setLocalScreenStream(stream);
            setIsScreenSharing(true);
            setCallIssue(null);
        } catch (err) {
            if (!isExpectedScreenShareCancellation(err)) {
                console.warn('[useCall] Screen share was not started', err);
                setCallIssue(mapScreenShareIssue(err));
            }
        }
    }, [cleanupScreenShare]);

    const watchRemoteScreen = useCallback(async () => {
        try {
            await webrtcRef.current?.watchRemoteScreen();
        } catch (err) {
            console.warn('[useCall] Failed to watch remote screen share', err);
            setCallIssue(buildCallIssue(err instanceof Error && err.message ? err.message : 'Could not load screen share. Try again.'));
        }
    }, []);

    const stopWatchingRemoteScreen = useCallback(async () => {
        try {
            await webrtcRef.current?.stopWatchingRemoteScreen();
        } catch (err) {
            console.warn('[useCall] Failed to stop watching remote screen share', err);
            setCallIssue(buildCallIssue('Unable to stop watching the screen share.'));
        }
    }, []);

    return {
        status,
        callServiceStatus,
        remoteUserId,
        remoteUsername,
        callId,
        isMuted,
        isScreenSharing,
        isScreenShareUpdating,
        isRemoteScreenLoading,
        isRemoteScreenAvailable,
        isWatchingRemoteScreen,
        remoteStream,
        remoteScreenStream,
        localScreenStream,
        seconds,
        diagnostics,
        callIssue,
        isIncomingActionPending,
        startCall,
        startScreenShare,
        stopScreenShare,
        watchRemoteScreen,
        stopWatchingRemoteScreen,
        acceptCall,
        rejectCall,
        hangUp,
        toggleMute,
    };
}
