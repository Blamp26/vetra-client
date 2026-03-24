import { useEffect, useRef, useState, useCallback } from 'react';
import type { Channel } from 'phoenix';
import { useAppStore } from '@/store';
import { WebRTCService } from '../services/webrtcService';
import type {
    CallStatus,
    UseCallReturn,
    IncomingCallPayload,
    AnswerPayload,
    IceCandidatePayload,
} from './useCall.types';

export function useCall(currentUserId: number): UseCallReturn {
    const socketManager = useAppStore((s) => s.socketManager);

    // ── Состояние ──────────────────────────────────────────────────────────────
    const [status, setStatus] = useState<CallStatus>('idle');
    const [remoteUserId, setRemoteUserId] = useState<number | null>(null);
    const [remoteUsername, setRemoteUsername] = useState<string | null>(null);
    const [callId, setCallId] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

    // ── Refs (не вызывают ре-рендер, нужны внутри колбэков) ───────────────────
    const callChannelRef = useRef<Channel | null>(null);
    const webrtcRef = useRef<WebRTCService | null>(null);
    const endedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Хелпер: завершить звонок локально ─────────────────────────────────────
    const resetAfterDelay = useCallback(() => {
        if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
        setStatus('ended');
        endedTimerRef.current = setTimeout(() => {
            setStatus('idle');
            setRemoteUserId(null);
            setRemoteUsername(null);
            setCallId(null);
            setRemoteStream(null);
            setIsMuted(false);
            webrtcRef.current = null;
        }, 2000);
    }, []);

    // ── Mount: подключить call-канал и подписаться на сигнальные события ───────
    useEffect(() => {
        if (!socketManager) return;

        const channel = socketManager.socket.channel(`call:${currentUserId}`, {});

        // "answer" — нам ответили (мы были caller)
        channel.on('answer', (payload: AnswerPayload) => {
            webrtcRef.current?.handleAnswer(payload.sdp);
            setRemoteUsername(payload.from_username);
            setStatus('active');
        });

        // "ice_candidate" — удалённый пир прислал кандидата
        channel.on('ice_candidate', (payload: IceCandidatePayload) => {
            webrtcRef.current?.addIceCandidate(payload.candidate);
        });

        // "hang_up" — собеседник положил трубку
        channel.on('hang_up', () => {
            webrtcRef.current?.hangUp();
            resetAfterDelay();
        });

        channel.join()
            .receive('ok', () => console.log('[useCall] call channel joined'))
            .receive('error', (r) => console.error('[useCall] call channel join error', r));

        callChannelRef.current = channel;

        // "incoming_call" приходит через user-канал (сервер делает Endpoint.broadcast)
        const unsubIncoming = socketManager.userChannel.on(
            'incoming_call',
            (payload: IncomingCallPayload) => {
                // DEBUG
                console.log('[useCall] incoming_call received', payload);
                setStatus('ringing');
                setRemoteUserId(payload.from_user_id);
                setRemoteUsername(payload.from_username);
                setCallId(payload.call_id);
            },
        );

        return () => {
            channel.leave();
            callChannelRef.current = null;
            // Phoenix channel.on не возвращает unsubscribe-функцию — снимаем через off
            socketManager.userChannel.off('incoming_call', unsubIncoming as number);
            if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
        };
    }, [socketManager, currentUserId, resetAfterDelay]);

    // ── startCall ──────────────────────────────────────────────────────────────
    const startCall = useCallback((targetUserId: number) => {
        // DEBUG
        console.log('[useCall] startCall → targetUserId:', targetUserId, '| current status:', status);
        const channel = callChannelRef.current;
        if (!channel || status !== 'idle') return;

        // Блокировка звонка себе 
        if (targetUserId === currentUserId) {
            console.warn('[useCall] Cannot call yourself');
            return;
        }

        setStatus('calling');
        setRemoteUserId(targetUserId);

        const service = new WebRTCService(channel, currentUserId, targetUserId);
        service.onRemoteStream = (stream) => setRemoteStream(stream);
        service.onCallIdReceived = (callId) => setCallId(callId);
        webrtcRef.current = service;

        service.startCall()
            .then(() => {
                // Таймаут 30с если никто не ответил 
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

    // ── acceptCall ─────────────────────────────────────────────────────────────
    const acceptCall = useCallback(() => {
        // remoteSdp пока неизвестен здесь — придёт через channel event "offer".
        // Реальная логика: на incoming_call мы сохраняем remoteSdp из offer payload,
        // но сервер шлёт incoming_call отдельно от самого SDP offer.
        // Поэтому acceptCall вызывается ПОСЛЕ того как получен SDP.
        // Храним его в ref, а не в state — нет смысла в ре-рендере.
        const channel = callChannelRef.current;
        const remote = remoteUserId;
        if (!channel || !remote || status !== 'ringing') return;

        const service = new WebRTCService(channel, currentUserId, remote);

        service.onRemoteStream = (stream) => {
            setRemoteStream(stream);
        };

        webrtcRef.current = service;
        setStatus('active');

        // remoteSdp берётся из offerSdpRef (заполняется ниже при получении "offer")
        const sdp = offerSdpRef.current;
        if (!sdp) {
            console.warn('[useCall] acceptCall called before offer SDP received');
            return;
        }

        service.acceptCall(sdp).catch((err) => {
            console.error('[useCall] acceptCall failed', err);
            resetAfterDelay();
        });
    }, [status, remoteUserId, currentUserId, resetAfterDelay]);

    // ── rejectCall ─────────────────────────────────────────────────────────────
    const rejectCall = useCallback(() => {
        const channel = callChannelRef.current;
        if (channel && callId && remoteUserId) {
            channel.push('hang_up', { call_id: callId, to_user_id: remoteUserId });
        }
        resetAfterDelay();
    }, [callId, remoteUserId, resetAfterDelay]);

    // ── hangUp ─────────────────────────────────────────────────────────────────
    const hangUp = useCallback(() => {
        const channel = callChannelRef.current;
        if (channel && callId && remoteUserId) {
            channel.push('hang_up', { call_id: callId, to_user_id: remoteUserId });
        }
        webrtcRef.current?.hangUp();
        resetAfterDelay();
    }, [callId, remoteUserId, resetAfterDelay]);

    // ── toggleMute ─────────────────────────────────────────────────────────────
    const toggleMute = useCallback(() => {
        const service = webrtcRef.current;
        if (!service) return;

        // WebRTCService не хранит localStream публично, но можно добавить геттер.
        // Пока работаем через внутренний доступ через тип any.
        const localStream: MediaStream | null = (service as unknown as { localStream: MediaStream | null }).localStream;

        if (!localStream) return;

        const audioTrack = localStream.getAudioTracks()[0];
        if (!audioTrack) return;

        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
    }, []);

    // ── Ref для хранения SDP offer от вызывающего ─────────────────────────────
    // (заполняется при получении события "offer" на call-канале)
    const offerSdpRef = useRef<string | null>(null);

    useEffect(() => {
        const channel = callChannelRef.current;
        if (!channel) return;

        // "offer" приходит callee-у через broadcast_from! на call-канале
        channel.on('offer', (payload: { sdp: string; from_user_id: number; from_username: string }) => {
            offerSdpRef.current = payload.sdp;
            // Если remoteUserId ещё не установлен (incoming_call пришёл без SDP),
            // дополним его здесь
            setRemoteUserId((prev) => prev ?? payload.from_user_id);
            setRemoteUsername((prev) => prev ?? payload.from_username);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socketManager]); // перепривязать при смене socketManager

    return {
        status,
        remoteUserId,
        remoteUsername,
        callId,
        isMuted,
        remoteStream,
        startCall,
        acceptCall,
        rejectCall,
        hangUp,
        toggleMute,
    };
}