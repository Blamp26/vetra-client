import type { Channel, Socket } from 'phoenix';
import type { ResourceRef } from '@/shared/types';
import type {
    AnswerPayload,
    CallServiceStatus,
    IceCandidatePayload,
    IncomingCallPayload,
    RenegotiationSignalPayload,
} from '../hooks/useCall.types';
import { debugCall } from '../utils/callDebug';

export interface OfferPayload {
    sdp: string;
    from_user_id: ResourceRef;
    from_username: string;
    call_id?: string;
}

export interface HangUpPayload {
    from_user_id: ResourceRef;
    call_id?: string;
}

type Handler<T> = (payload: T) => void;
const RETRY_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000];

function createBus<T>() {
    const handlers = new Set<Handler<T>>();

    return {
        emit(payload: T): void {
            handlers.forEach((handler) => handler(payload));
        },
        subscribe(handler: Handler<T>): () => void {
            handlers.add(handler);
            return () => handlers.delete(handler);
        },
    };
}

class CallSignalingService {
    private socket: Socket | null = null;
    private channel: Channel | null = null;
    private userChannel: Channel | null = null;
    private currentUserId: number | null = null;
    private currentUserCallRef: ResourceRef | null = null;
    private incomingCallRef: number | null = null;
    private pendingOffer: OfferPayload | null = null;
    private channelReady = false;
    private readinessStatus: CallServiceStatus = 'idle';
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private retryAttempt = 0;
    private joinGeneration = 0;
    private intentionallyDisconnected = true;

    private readonly offerBus = createBus<OfferPayload>();
    private readonly incomingCallBus = createBus<IncomingCallPayload>();
    private readonly answerBus = createBus<AnswerPayload>();
    private readonly iceCandidateBus = createBus<IceCandidatePayload>();
    private readonly renegotiationBus = createBus<RenegotiationSignalPayload & { from_user_id: ResourceRef; call_id?: string }>();
    private readonly hangUpBus = createBus<HangUpPayload>();
    private readonly channelCloseBus = createBus<{ reason: string }>();
    private readonly readinessBus = createBus<CallServiceStatus>();

    initialize(socket: Socket, userChannel: Channel, currentUserId: number, currentUserCallRef: ResourceRef = currentUserId): void {
        if (
            this.channel &&
            this.socket === socket &&
            this.userChannel === userChannel &&
            this.currentUserId === currentUserId &&
            this.currentUserCallRef === currentUserCallRef
        ) {
            return;
        }

        this.disconnect();
        this.socket = socket;
        this.currentUserId = currentUserId;
        this.currentUserCallRef = currentUserCallRef;
        this.userChannel = userChannel;
        this.intentionallyDisconnected = false;

        this.incomingCallRef = userChannel.on('incoming_call', (payload: IncomingCallPayload) => {
            this.incomingCallBus.emit(payload);
        });

        this.startJoinAttempt('initialize');
    }

    disconnect(): void {
        this.intentionallyDisconnected = true;
        this.clearRetryTimer();
        this.joinGeneration += 1;
        if (this.channel) {
            this.channel.leave();
        }
        if (this.userChannel && this.incomingCallRef !== null) {
            this.userChannel.off('incoming_call', this.incomingCallRef);
        }
        this.socket = null;
        this.channel = null;
        this.userChannel = null;
        this.currentUserId = null;
        this.currentUserCallRef = null;
        this.incomingCallRef = null;
        this.pendingOffer = null;
        this.channelReady = false;
        this.retryAttempt = 0;
        this.setReadinessStatus('idle', { reason: 'disconnect' });
    }

    private startJoinAttempt(reason: string): void {
        const socket = this.socket;
        const currentUserCallRef = this.currentUserCallRef;
        if (!socket || currentUserCallRef === null || currentUserCallRef === undefined) {
            this.channelReady = false;
            this.setReadinessStatus('idle', { reason: 'missing_socket_or_user' });
            return;
        }

        this.clearRetryTimer();
        this.joinGeneration += 1;
        const generation = this.joinGeneration;
        const previousChannel = this.channel;
        if (previousChannel) {
            previousChannel.leave();
        }

        this.channelReady = false;
        this.setReadinessStatus(this.retryAttempt > 0 ? 'retrying' : 'connecting', {
            reason,
            currentUserCallRef,
        });

        const channel = socket.channel(`call:${currentUserCallRef}`, {});
        channel.on('offer', (payload: OfferPayload) => {
            if (!this.isCurrentChannel(channel, generation)) return;
            this.pendingOffer = payload;
            this.offerBus.emit(payload);
        });
        channel.on('answer', (payload: AnswerPayload) => {
            if (!this.isCurrentChannel(channel, generation)) return;
            this.answerBus.emit(payload);
        });
        channel.on('ice_candidate', (payload: IceCandidatePayload) => {
            if (!this.isCurrentChannel(channel, generation)) return;
            this.iceCandidateBus.emit(payload);
        });
        channel.on('renegotiate', (payload: RenegotiationSignalPayload & { from_user_id: ResourceRef; call_id?: string }) => {
            if (!this.isCurrentChannel(channel, generation)) return;
            this.renegotiationBus.emit(payload);
        });
        channel.on('hang_up', (payload: HangUpPayload) => {
            if (!this.isCurrentChannel(channel, generation)) return;
            this.hangUpBus.emit(payload);
        });
        channel.onClose?.(() => {
            if (!this.isCurrentChannel(channel, generation)) return;
            this.channelReady = false;
            this.channelCloseBus.emit({ reason: 'closed' });
            this.setReadinessStatus('closed', { currentUserCallRef });
            this.scheduleRetry('closed');
        });
        channel.onError?.(() => {
            if (!this.isCurrentChannel(channel, generation)) return;
            this.channelReady = false;
            this.channelCloseBus.emit({ reason: 'error' });
            this.setReadinessStatus('failed', { currentUserCallRef });
            this.scheduleRetry('error');
        });

        this.channel = channel;
        const joinPush = channel.join();
        joinPush.receive('ok', () => {
            if (!this.isCurrentChannel(channel, generation)) return;
            this.channelReady = true;
            this.retryAttempt = 0;
            this.setReadinessStatus('ready', { currentUserCallRef });
            debugCall('[callSignaling] call channel joined', { currentUserCallRef });
        });
        joinPush.receive('error', (reason) => {
            if (!this.isCurrentChannel(channel, generation)) return;
            this.channelReady = false;
            this.setReadinessStatus('failed', { currentUserCallRef, reason });
            debugCall('[callSignaling] call channel join error', { currentUserCallRef, reason });
            this.scheduleRetry('join_error');
        });
        joinPush.receive('timeout', () => {
            if (!this.isCurrentChannel(channel, generation)) return;
            this.channelReady = false;
            this.setReadinessStatus('failed', { currentUserCallRef, reason: 'timeout' });
            debugCall('[callSignaling] call channel join timeout', { currentUserCallRef });
            this.scheduleRetry('join_timeout');
        });
    }

    private isCurrentChannel(channel: Channel, generation: number): boolean {
        return this.channel === channel && this.joinGeneration === generation;
    }

    private scheduleRetry(reason: string): void {
        if (this.intentionallyDisconnected || !this.socket || this.currentUserCallRef === null || this.currentUserCallRef === undefined) {
            return;
        }

        this.clearRetryTimer();
        const delay = RETRY_DELAYS_MS[Math.min(this.retryAttempt, RETRY_DELAYS_MS.length - 1)];
        this.retryAttempt += 1;
        this.setReadinessStatus('retrying', {
            reason,
            delay,
            attempt: this.retryAttempt,
            currentUserCallRef: this.currentUserCallRef,
        });
        debugCall('[callSignaling] retry scheduled', {
            reason,
            delay,
            attempt: this.retryAttempt,
            currentUserCallRef: this.currentUserCallRef,
        });
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.startJoinAttempt(`retry:${reason}`);
        }, delay);
    }

    private clearRetryTimer(): void {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    private setReadinessStatus(status: CallServiceStatus, details?: Record<string, unknown>): void {
        if (this.readinessStatus === status) return;

        this.readinessStatus = status;
        debugCall('[callSignaling] readiness changed', { status, ...details });
        this.readinessBus.emit(status);
    }

    getChannel(): Channel | null {
        return this.channel;
    }

    isReady(): boolean {
        return Boolean(this.channel && this.channelReady);
    }

    getReadinessStatus(): CallServiceStatus {
        return this.readinessStatus;
    }

    consumePendingOffer(): OfferPayload | null {
        const offer = this.pendingOffer;
        this.pendingOffer = null;
        return offer;
    }

    clearPendingOffer(payload: OfferPayload): void {
        if (this.pendingOffer === payload || this.pendingOffer?.call_id === payload.call_id) {
            this.pendingOffer = null;
        }
    }

    onOffer(handler: Handler<OfferPayload>): () => void {
        return this.offerBus.subscribe(handler);
    }

    onIncomingCall(handler: Handler<IncomingCallPayload>): () => void {
        return this.incomingCallBus.subscribe(handler);
    }

    onAnswer(handler: Handler<AnswerPayload>): () => void {
        return this.answerBus.subscribe(handler);
    }

    onIceCandidate(handler: Handler<IceCandidatePayload>): () => void {
        return this.iceCandidateBus.subscribe(handler);
    }

    onRenegotiation(handler: Handler<RenegotiationSignalPayload & { from_user_id: ResourceRef; call_id?: string }>): () => void {
        return this.renegotiationBus.subscribe(handler);
    }

    onHangUp(handler: Handler<HangUpPayload>): () => void {
        return this.hangUpBus.subscribe(handler);
    }

    onChannelClose(handler: Handler<{ reason: string }>): () => void {
        return this.channelCloseBus.subscribe(handler);
    }

    onReadinessChange(handler: Handler<CallServiceStatus>): () => void {
        return this.readinessBus.subscribe(handler);
    }
}

export const callSignalingService = new CallSignalingService();
