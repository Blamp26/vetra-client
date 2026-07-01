import type { Channel, Socket } from 'phoenix';
import type { ResourceRef } from '@/shared/types';
import type {
    AnswerPayload,
    IceCandidatePayload,
    IncomingCallPayload,
    RenegotiationSignalPayload,
} from '../hooks/useCall.types';

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

    private readonly offerBus = createBus<OfferPayload>();
    private readonly incomingCallBus = createBus<IncomingCallPayload>();
    private readonly answerBus = createBus<AnswerPayload>();
    private readonly iceCandidateBus = createBus<IceCandidatePayload>();
    private readonly renegotiationBus = createBus<RenegotiationSignalPayload & { from_user_id: ResourceRef; call_id?: string }>();
    private readonly hangUpBus = createBus<HangUpPayload>();

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

        const channel = socket.channel(`call:${currentUserCallRef}`, {});
        channel.on('offer', (payload: OfferPayload) => {
            this.pendingOffer = payload;
            this.offerBus.emit(payload);
        });
        channel.on('answer', (payload: AnswerPayload) => {
            this.answerBus.emit(payload);
        });
        channel.on('ice_candidate', (payload: IceCandidatePayload) => {
            this.iceCandidateBus.emit(payload);
        });
        channel.on('renegotiate', (payload: RenegotiationSignalPayload & { from_user_id: ResourceRef; call_id?: string }) => {
            this.renegotiationBus.emit(payload);
        });
        channel.on('hang_up', (payload: HangUpPayload) => {
            this.hangUpBus.emit(payload);
        });

        channel.join()
            .receive('ok', () => console.log('[callSignaling] call channel joined'))
            .receive('error', (reason) => console.error('[callSignaling] call channel join error', reason));

        this.incomingCallRef = userChannel.on('incoming_call', (payload: IncomingCallPayload) => {
            this.incomingCallBus.emit(payload);
        });
        this.userChannel = userChannel;
        this.channel = channel;
    }

    disconnect(): void {
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
    }

    getChannel(): Channel | null {
        return this.channel;
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
}

export const callSignalingService = new CallSignalingService();
