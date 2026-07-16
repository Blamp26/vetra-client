import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Channel } from 'phoenix';

const { mockAppState } = vi.hoisted(() => ({
    mockAppState: {
        selectedInputDeviceId: 'default',
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
    },
}));

vi.mock('@/store', () => ({
    getState: () => mockAppState,
}));

import { WebRTCService } from './webrtcService';

const ANSWER_TIMEOUT_MS = 8_000;

type SignalEvent = 'offer' | 'answer' | 'ice_candidate' | 'renegotiate' | 'hang_up';
type ServerRateKey = 'offer' | 'answer' | 'ice_candidate' | 'renegotiate' | 'hang_up';

class FakeMediaStreamTrack {
    public readonly id: string;
    public readonly kind: 'audio' | 'video';
    public enabled = true;
    public muted = false;
    public readyState: MediaStreamTrackState = 'live';
    public onended: (() => void) | null = null;
    public onmute: (() => void) | null = null;
    public onunmute: (() => void) | null = null;
    private listeners = new Map<string, Set<() => void>>();

    constructor(kind: 'audio' | 'video', options?: { muted?: boolean; id?: string }) {
        this.kind = kind;
        this.muted = options?.muted ?? false;
        this.id = options?.id ?? `${kind}-${Math.random().toString(36).slice(2, 10)}`;
    }

    stop(): void {
        if (this.readyState === 'ended') return;
        this.readyState = 'ended';
        this.emit('ended');
    }

    addEventListener(event: 'ended' | 'mute' | 'unmute', handler: () => void): void {
        const set = this.listeners.get(event) ?? new Set<() => void>();
        set.add(handler);
        this.listeners.set(event, set);
    }

    removeEventListener(event: 'ended' | 'mute' | 'unmute', handler: () => void): void {
        this.listeners.get(event)?.delete(handler);
    }

    setMuted(nextMuted: boolean): void {
        if (this.readyState === 'ended' || this.muted === nextMuted) return;
        this.muted = nextMuted;
        this.emit(nextMuted ? 'mute' : 'unmute');
    }

    private emit(event: 'ended' | 'mute' | 'unmute'): void {
        this.listeners.get(event)?.forEach((handler) => handler());
        if (event === 'ended') this.onended?.();
        if (event === 'mute') this.onmute?.();
        if (event === 'unmute') this.onunmute?.();
    }
}

class FakeMediaStream {
    private readonly tracks: FakeMediaStreamTrack[];

    constructor(tracks: FakeMediaStreamTrack[] = []) {
        this.tracks = tracks;
    }

    getTracks(): FakeMediaStreamTrack[] {
        return [...this.tracks];
    }

    getAudioTracks(): FakeMediaStreamTrack[] {
        return this.tracks.filter((track) => track.kind === 'audio');
    }

    getVideoTracks(): FakeMediaStreamTrack[] {
        return this.tracks.filter((track) => track.kind === 'video');
    }
}

type FakeReceiver = { track: FakeMediaStreamTrack };
type FakeSender = {
    track: FakeMediaStreamTrack | null;
    replaceTrack: (track: FakeMediaStreamTrack | null) => Promise<void>;
};
type FakeTransceiver = {
    direction: RTCRtpTransceiverDirection;
    sender: FakeSender;
};

let pendingPeerConnection: FakeRTCPeerConnection | null = null;

class FakeRTCPeerConnection {
    public connectionState: RTCPeerConnectionState = 'new';
    public iceConnectionState: RTCIceConnectionState = 'new';
    public iceGatheringState: RTCIceGatheringState = 'new';
    public signalingState: RTCSignalingState = 'stable';
    public localDescription: RTCSessionDescriptionInit | null = null;
    public remoteDescription: RTCSessionDescriptionInit | null = null;
    public ontrack: ((event: RTCTrackEvent) => void) | null = null;
    public onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
    public onconnectionstatechange: (() => void) | null = null;
    public oniceconnectionstatechange: (() => void) | null = null;
    public onicegatheringstatechange: (() => void) | null = null;
    public onsignalingstatechange: (() => void) | null = null;
    public partner: FakeRTCPeerConnection | null = null;
    public receivers: FakeReceiver[] = [];
    public screenSender: FakeSender | null = null;
    public screenTransceiver: FakeTransceiver | null = null;
    public addTrack = vi.fn((track: FakeMediaStreamTrack) => {
        const sender: FakeSender = {
            track,
            replaceTrack: vi.fn(async (nextTrack) => {
                sender.track = nextTrack;
            }),
        };
        return sender;
    });
    public addTransceiver = vi.fn((track: FakeMediaStreamTrack, init?: RTCRtpTransceiverInit) => {
        const sender: FakeSender = {
            track,
            replaceTrack: vi.fn(async (nextTrack) => {
                sender.track = nextTrack;
            }),
        };
        const transceiver: FakeTransceiver = {
            direction: init?.direction ?? 'sendrecv',
            sender,
        };
        this.screenSender = sender;
        this.screenTransceiver = transceiver;
        return transceiver;
    });
    public addIceCandidate = vi.fn().mockResolvedValue(undefined);
    public getReceivers = vi.fn(() => this.receivers);
    public getStats = vi.fn(async () => ({ values: () => new Map().values() }));
    public close = vi.fn(() => {
        this.connectionState = 'closed';
        this.iceConnectionState = 'closed';
    });
    public createOffer = vi.fn(async () => ({
        type: 'offer',
        sdp: this.buildSdp(),
    }));
    public createAnswer = vi.fn(async () => ({
        type: 'answer',
        sdp: this.buildSdp(),
    }));
    public setLocalDescription = vi.fn(async (desc: RTCSessionDescriptionInit) => {
        if (desc.type === 'rollback') {
            this.localDescription = null;
            this.signalingState = 'stable';
        } else {
            this.localDescription = desc;
            this.signalingState = desc.type === 'offer' ? 'have-local-offer' : 'stable';
            this.maybeMarkConnected();
            this.emitIceCandidates();
        }
        this.onsignalingstatechange?.();
    });
    public setRemoteDescription = vi.fn(async (desc: RTCSessionDescriptionInit) => {
        this.remoteDescription = desc;
        this.signalingState = desc.type === 'offer' ? 'have-remote-offer' : 'stable';
        if (desc.type === 'offer') {
            this.syncScreenReceiverFromPartner();
        }
        this.maybeMarkConnected();
        this.onsignalingstatechange?.();
    });

    constructor(_config: RTCConfiguration) {
        if (pendingPeerConnection) {
            this.partner = pendingPeerConnection;
            pendingPeerConnection.partner = this;
            pendingPeerConnection = null;
        } else {
            pendingPeerConnection = this;
        }
    }

    private buildSdp(): string {
        const videoDirection = this.currentVideoDirection();
        const sections = [
            'v=0',
            'm=audio 9 UDP/TLS/RTP/SAVPF 111',
            'a=sendrecv',
        ];

        if (videoDirection) {
            sections.push('m=video 9 UDP/TLS/RTP/SAVPF 96');
            sections.push(`a=${videoDirection}`);
        }

        return sections.join('\r\n');
    }

    private currentVideoDirection(): RTCRtpTransceiverDirection | null {
        if (!this.screenTransceiver) return null;
        return this.screenTransceiver.direction;
    }

    private shouldSendScreen(): boolean {
        return Boolean(
            this.screenTransceiver &&
            (this.screenTransceiver.direction === 'sendonly' || this.screenTransceiver.direction === 'sendrecv') &&
            this.screenSender?.track &&
            this.screenSender.track.readyState === 'live',
        );
    }

    private syncScreenReceiverFromPartner(): void {
        if (!this.partner?.shouldSendScreen()) {
            this.receivers = [];
            return;
        }

        const remoteTrack = new FakeMediaStreamTrack('video', { muted: true });
        this.receivers = [{ track: remoteTrack }];
        const stream = new FakeMediaStream([remoteTrack]);
        this.ontrack?.({ track: remoteTrack, streams: [stream] } as unknown as RTCTrackEvent);
        setTimeout(() => {
            remoteTrack.setMuted(false);
        }, 0);
    }

    private maybeMarkConnected(): void {
        if (!this.localDescription || !this.remoteDescription) return;
        this.connectionState = 'connected';
        this.iceConnectionState = 'connected';
        this.iceGatheringState = 'complete';
        this.onconnectionstatechange?.();
        this.oniceconnectionstatechange?.();
        this.onicegatheringstatechange?.();
        this.partner?.mirrorConnectedState();
    }

    private mirrorConnectedState(): void {
        this.connectionState = 'connected';
        this.iceConnectionState = 'connected';
        this.iceGatheringState = 'complete';
        this.onconnectionstatechange?.();
        this.oniceconnectionstatechange?.();
        this.onicegatheringstatechange?.();
    }

    private emitIceCandidates(): void {
        if (!this.onicecandidate) return;
        setTimeout(() => {
            for (let index = 0; index < 3; index += 1) {
                this.onicecandidate?.({
                    candidate: {
                        candidate: `candidate-${index}`,
                        sdpMid: '0',
                        sdpMLineIndex: 0,
                    } as RTCIceCandidate,
                } as RTCPeerConnectionIceEvent);
            }
            this.onicecandidate?.({ candidate: null } as RTCPeerConnectionIceEvent);
        }, 0);
    }
}

class FakeRTCSessionDescription {
    public readonly type: RTCSdpType;
    public readonly sdp?: string;

    constructor(init: RTCSessionDescriptionInit) {
        this.type = init.type ?? 'offer';
        this.sdp = init.sdp;
    }
}

class FakeRTCIceCandidate {
    public readonly candidate?: string;
    public readonly sdpMid?: string | null;
    public readonly sdpMLineIndex?: number | null;
    public readonly usernameFragment?: string | null;

    constructor(init: RTCIceCandidateInit) {
        this.candidate = init.candidate;
        this.sdpMid = init.sdpMid ?? null;
        this.sdpMLineIndex = init.sdpMLineIndex ?? null;
        this.usernameFragment = init.usernameFragment ?? null;
    }
}

class FakeRateLimiter {
    private readonly buckets = new Map<string, { count: number; expiresAt: number }>();
    private now = 0;

    check(key: string, limit: number, windowSeconds: number): { ok: true } | { ok: false; reason: 'rate_limited' } {
        this.now += 1;
        const current = this.buckets.get(key);
        if (current && this.now < current.expiresAt) {
            if (current.count >= limit) return { ok: false, reason: 'rate_limited' };
            current.count += 1;
            return { ok: true };
        }

        this.buckets.set(key, { count: 1, expiresAt: this.now + windowSeconds });
        return { ok: true };
    }
}

class FakePushResponse {
    constructor(
        private readonly result:
        | { kind: 'ok'; payload?: unknown }
        | { kind: 'error'; payload?: unknown }
        | { kind: 'timeout' },
    ) { }

    receive(event: 'ok' | 'error' | 'timeout', callback: (payload?: unknown) => void): FakePushResponse {
        queueMicrotask(() => {
            if (event === this.result.kind) {
                callback('payload' in this.result ? this.result.payload : undefined);
            }
        });
        return this;
    }
}

class FakeCallServer {
    private readonly peers = new Map<number, ServicePeer>();
    private readonly calls = new Map<string, { callerId: number; calleeId: number; status: 'ringing' | 'active' }>();
    private readonly rateLimiter = new FakeRateLimiter();
    public readonly rejections: Array<{ event: SignalEvent; reason: string }> = [];
    public holdNextRenegotiationAnswer = false;
    private heldDeliveries: Array<{ toUserId: number; event: SignalEvent; payload: any }> = [];

    register(peer: ServicePeer): Channel {
        this.peers.set(peer.userId, peer);
        return {
            push: (event: SignalEvent, payload: Record<string, unknown>) => this.push(peer.userId, event, payload),
        } as unknown as Channel;
    }

    releaseHeldDeliveries(): void {
        const deliveries = [...this.heldDeliveries];
        this.heldDeliveries = [];
        deliveries.forEach(({ toUserId, event, payload }) => {
            this.deliver(toUserId, event, payload);
        });
    }

    private push(fromUserId: number, event: SignalEvent, payload: Record<string, unknown>): FakePushResponse {
        const rate = this.checkRate(fromUserId, event);
        if (!rate.ok) {
            this.rejections.push({ event, reason: rate.reason });
            return new FakePushResponse({ kind: 'error', payload: { reason: rate.reason } });
        }

        try {
            switch (event) {
                case 'offer':
                    return this.handleOffer(fromUserId, payload);
                case 'answer':
                    return this.handleAnswer(fromUserId, payload);
                case 'ice_candidate':
                    return this.handleIceCandidate(fromUserId, payload);
                case 'renegotiate':
                    return this.handleRenegotiate(fromUserId, payload);
                case 'hang_up':
                    return this.handleHangUp(fromUserId, payload);
            }
        } catch (error) {
            this.rejections.push({ event, reason: error instanceof Error ? error.message : String(error) });
            return new FakePushResponse({ kind: 'error', payload: { reason: 'server_error' } });
        }
    }

    private handleOffer(fromUserId: number, payload: Record<string, unknown>): FakePushResponse {
        const toUserId = Number(payload.to_user_id);
        const callId = `${fromUserId}:${toUserId}`;
        this.calls.set(callId, { callerId: fromUserId, calleeId: toUserId, status: 'ringing' });
        this.deliver(toUserId, 'offer', {
            from_user_id: fromUserId,
            from_username: `user-${fromUserId}`,
            sdp: payload.sdp,
            call_id: callId,
        });
        return new FakePushResponse({ kind: 'ok', payload: { call_id: callId } });
    }

    private handleAnswer(fromUserId: number, payload: Record<string, unknown>): FakePushResponse {
        const callId = String(payload.call_id);
        const call = this.calls.get(callId);
        if (!call) return new FakePushResponse({ kind: 'error', payload: { reason: 'not_found' } });
        call.status = 'active';
        const toUserId = call.callerId === fromUserId ? call.calleeId : call.callerId;
        this.deliver(toUserId, 'answer', {
            from_user_id: fromUserId,
            from_username: `user-${fromUserId}`,
            sdp: payload.sdp,
            call_id: callId,
        });
        return new FakePushResponse({ kind: 'ok' });
    }

    private handleIceCandidate(fromUserId: number, payload: Record<string, unknown>): FakePushResponse {
        const toUserId = Number(payload.to_user_id);
        const callId = String(payload.call_id);
        if (!this.authorized(callId, fromUserId, toUserId)) {
            return new FakePushResponse({ kind: 'error', payload: { reason: 'unauthorized' } });
        }
        this.deliver(toUserId, 'ice_candidate', {
            from_user_id: fromUserId,
            candidate: payload.candidate,
            call_id: callId,
        });
        return new FakePushResponse({ kind: 'ok' });
    }

    private handleRenegotiate(fromUserId: number, payload: Record<string, unknown>): FakePushResponse {
        const toUserId = Number(payload.to_user_id);
        const callId = String(payload.call_id);
        const call = this.calls.get(callId);
        if (!call || call.status !== 'active') {
            return new FakePushResponse({ kind: 'error', payload: { reason: call ? 'call_not_active' : 'not_found' } });
        }
        if (!this.authorized(callId, fromUserId, toUserId)) {
            return new FakePushResponse({ kind: 'error', payload: { reason: 'unauthorized' } });
        }

        const delivery = {
            from_user_id: fromUserId,
            call_id: callId,
            type: payload.type,
            sdp: payload.sdp,
            screen_share_active: payload.screen_share_active,
        };

        if (this.holdNextRenegotiationAnswer && payload.type === 'answer') {
            this.holdNextRenegotiationAnswer = false;
            this.heldDeliveries.push({ toUserId, event: 'renegotiate', payload: delivery });
        } else {
            this.deliver(toUserId, 'renegotiate', delivery);
        }

        return new FakePushResponse({ kind: 'ok' });
    }

    private handleHangUp(fromUserId: number, payload: Record<string, unknown>): FakePushResponse {
        const toUserId = Number(payload.to_user_id);
        const callId = String(payload.call_id);
        this.calls.delete(callId);
        this.deliver(toUserId, 'hang_up', {
            from_user_id: fromUserId,
            call_id: callId,
        });
        return new FakePushResponse({ kind: 'ok' });
    }

    private deliver(toUserId: number, event: SignalEvent, payload: any): void {
        queueMicrotask(() => {
            void this.peers.get(toUserId)?.receive(event, payload);
        });
    }

    private authorized(callId: string, fromUserId: number, toUserId: number): boolean {
        const call = this.calls.get(callId);
        if (!call) {
            return callId === `${fromUserId}:${toUserId}` || callId === `${toUserId}:${fromUserId}`;
        }
        return (
            (call.callerId === fromUserId && call.calleeId === toUserId) ||
            (call.callerId === toUserId && call.calleeId === fromUserId)
        );
    }

    private checkRate(fromUserId: number, event: ServerRateKey): { ok: true } | { ok: false; reason: 'rate_limited' } {
        const [key, limit, windowSeconds] = (() => {
            switch (event) {
                case 'ice_candidate':
                    return ['channel:call_ice_candidate', 240, 60] as const;
                case 'renegotiate':
                    return ['channel:call_renegotiate', 60, 60] as const;
                case 'offer':
                    return ['channel:call_offer', 20, 60] as const;
                case 'answer':
                    return ['channel:call_answer', 20, 60] as const;
                case 'hang_up':
                    return ['channel:call_hang_up', 30, 60] as const;
            }
        })();

        return this.rateLimiter.check(`${key}:user:${fromUserId}`, limit, windowSeconds);
    }
}

class ServicePeer {
    public readonly service: WebRTCService;
    public status: 'idle' | 'calling' | 'ringing' | 'active' | 'ended' = 'idle';
    public callId: string | null = null;
    public pendingOfferSdp: string | null = null;
    public remoteScreenStream: MediaStream | null = null;
    public remoteScreenLoading = false;
    public screenShareUpdating = false;

    constructor(
        private readonly server: FakeCallServer,
        public readonly userId: number,
        public readonly remoteUserId: number,
    ) {
        const channel = this.server.register(this);
        this.service = new WebRTCService(channel, userId, remoteUserId);
        this.service.onCallIdReceived = (nextCallId) => {
            this.callId = nextCallId;
            this.service.setCallId(nextCallId);
        };
        this.service.onRemoteScreenStream = (stream) => {
            this.remoteScreenStream = stream;
        };
        this.service.onRemoteScreenLoading = (loading) => {
            this.remoteScreenLoading = loading;
        };
        this.service.onScreenShareUpdatingChange = (updating) => {
            this.screenShareUpdating = updating;
        };
    }

    async startCall(): Promise<void> {
        this.status = 'calling';
        await this.service.startCall();
    }

    async acceptCall(): Promise<void> {
        if (!this.pendingOfferSdp) throw new Error('No pending offer to accept');
        this.service.setCallId(this.callId);
        this.status = 'active';
        const offerSdp = this.pendingOfferSdp;
        this.pendingOfferSdp = null;
        await this.service.acceptCall(offerSdp);
    }

    async startScreenShare(): Promise<void> {
        await this.service.startScreenShare();
    }

    watchRemoteScreen(): Promise<void> {
        return this.service.watchRemoteScreen();
    }

    stopScreenShare(): Promise<void> {
        return this.service.stopScreenShare();
    }

    async hangUp(): Promise<void> {
        if (this.callId) {
            await new Promise<void>((resolve, reject) => {
                ((this.service as any).channel as Channel).push('hang_up', {
                    call_id: this.callId,
                    to_user_id: this.remoteUserId,
                }).receive('ok', () => resolve()).receive('error', (reason: unknown) => reject(reason));
            });
        }
        this.service.dispose();
        this.status = 'ended';
        this.callId = null;
    }

    async receive(event: SignalEvent, payload: any): Promise<void> {
        switch (event) {
            case 'offer':
                this.status = 'ringing';
                this.callId = payload.call_id;
                this.pendingOfferSdp = payload.sdp;
                this.service.setCallId(payload.call_id);
                break;
            case 'answer':
                this.callId = payload.call_id ?? this.callId;
                if (this.callId) this.service.setCallId(this.callId);
                await this.service.handleAnswer(payload.sdp);
                this.status = 'active';
                break;
            case 'ice_candidate':
                await this.service.addIceCandidate(payload.candidate);
                break;
            case 'renegotiate':
                if (!(this.service as any).peerConnection) return;
                this.callId = payload.call_id ?? this.callId;
                if (this.callId) this.service.setCallId(this.callId);
                await this.service.handleRenegotiation(payload);
                break;
            case 'hang_up':
                this.service.dispose();
                this.status = 'idle';
                this.callId = null;
                this.pendingOfferSdp = null;
                this.remoteScreenStream = null;
                this.remoteScreenLoading = false;
                this.screenShareUpdating = false;
                break;
        }
    }

    get peerConnection(): FakeRTCPeerConnection | null {
        return (this.service as any).peerConnection as FakeRTCPeerConnection | null;
    }

    get internal(): any {
        return this.service as any;
    }
}

async function pump(turns = 6): Promise<void> {
    for (let index = 0; index < turns; index += 1) {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(1);
        await Promise.resolve();
    }
}

async function waitUntil(assertion: () => void, attempts = 60): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            assertion();
            return;
        } catch (error) {
            lastError = error;
            await pump();
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

describe('WebRTCService stress integration', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    const unhandledRejections: unknown[] = [];

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        pendingPeerConnection = null;
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        global.MediaStream = FakeMediaStream as unknown as typeof MediaStream;
        global.RTCPeerConnection = FakeRTCPeerConnection as unknown as typeof RTCPeerConnection;
        global.RTCSessionDescription = FakeRTCSessionDescription as unknown as typeof RTCSessionDescription;
        global.RTCIceCandidate = FakeRTCIceCandidate as unknown as typeof RTCIceCandidate;
        Object.defineProperty(global.navigator, 'mediaDevices', {
            value: {
                getUserMedia: vi.fn(async () => new FakeMediaStream([new FakeMediaStreamTrack('audio')])),
                getDisplayMedia: vi.fn(async () => new FakeMediaStream([new FakeMediaStreamTrack('video')])),
            },
            configurable: true,
            writable: true,
        });
        unhandledRejections.length = 0;
        window.addEventListener('unhandledrejection', handleUnhandledRejection);
    });

    afterEach(() => {
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        vi.useRealTimers();
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    function handleUnhandledRejection(event: PromiseRejectionEvent): void {
        unhandledRejections.push(event.reason);
    }

    it('completes three full call scenarios with five screen-share cycles each', async () => {
        for (let scenarioIndex = 0; scenarioIndex < 3; scenarioIndex += 1) {
            const server = new FakeCallServer();
            const caller = new ServicePeer(server, scenarioIndex * 2 + 1, scenarioIndex * 2 + 2);
            const callee = new ServicePeer(server, scenarioIndex * 2 + 2, scenarioIndex * 2 + 1);

            await caller.startCall();
            await pump();
            expect(callee.status).toBe('ringing');

            await callee.acceptCall();
            await waitUntil(() => {
                expect(caller.status).toBe('active');
                expect(callee.status).toBe('active');
                expect(caller.peerConnection?.signalingState).toBe('stable');
                expect(callee.peerConnection?.signalingState).toBe('stable');
            });

            for (let cycle = 0; cycle < 5; cycle += 1) {
                await caller.startScreenShare();
                await waitUntil(() => expect(callee.internal.remoteScreenAvailable).toBe(true));
                await callee.watchRemoteScreen();
                await waitUntil(() => {
                    expect(callee.remoteScreenStream).not.toBeNull();
                    expect(callee.remoteScreenLoading).toBe(false);
                    expect(caller.internal.isRenegotiationInFlight).toBe(false);
                    expect(caller.peerConnection?.signalingState).toBe('stable');
                });

                const stopPromise = caller.stopScreenShare();
                await Promise.resolve();
                expect(caller.internal.screenStream).toBeNull();
                expect(caller.internal.isScreenShareActiveLocal).toBe(false);
                const localVideoTrack = caller.internal.screenSender?.track;
                expect(localVideoTrack).toBeNull();

                await stopPromise;
                await waitUntil(() => {
                    expect(callee.remoteScreenStream).toBeNull();
                    expect(callee.remoteScreenLoading).toBe(false);
                    expect(caller.internal.isRenegotiationInFlight).toBe(false);
                    expect(caller.peerConnection?.signalingState).toBe('stable');
                });
            }

            expect(caller.peerConnection?.addTransceiver).toHaveBeenCalledTimes(1);
            expect(server.rejections).toEqual([]);

            await caller.hangUp();
            await waitUntil(() => {
                expect(callee.status).toBe('idle');
                expect(callee.remoteScreenStream).toBeNull();
            });

            expect(caller.internal.renegotiationAnswerTimeoutRef).toBeNull();
            expect(callee.internal.renegotiationAnswerTimeoutRef).toBeNull();
            expect(caller.internal.screenStream).toBeNull();
            expect(callee.remoteScreenStream).toBeNull();
            expect(caller.internal.isRenegotiationInFlight).toBe(false);
            expect(callee.internal.isRenegotiationInFlight).toBe(false);
        }

        expect(unhandledRejections).toEqual([]);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('clears pending renegotiation timers on hangup while a screen-share answer is withheld', async () => {
        const server = new FakeCallServer();
        const caller = new ServicePeer(server, 101, 102);
        const callee = new ServicePeer(server, 102, 101);

        await caller.startCall();
        await pump();
        await callee.acceptCall();
        await waitUntil(() => {
            expect(caller.status).toBe('active');
            expect(callee.status).toBe('active');
        });

        server.holdNextRenegotiationAnswer = true;
        await caller.startScreenShare();
        await pump();

        expect(caller.internal.isRenegotiationInFlight).toBe(true);
        expect(caller.internal.renegotiationAnswerTimeoutRef).not.toBeNull();

        await caller.hangUp();
        server.releaseHeldDeliveries();
        await pump();

        expect(caller.internal.renegotiationAnswerTimeoutRef).toBeNull();
        expect(caller.internal.isRenegotiationInFlight).toBe(false);
        expect(callee.status).toBe('idle');
        expect(unhandledRejections).toEqual([]);
    });

    it('does not leak rate-limit rejections under repeated ICE plus renegotiation traffic', async () => {
        const server = new FakeCallServer();
        const caller = new ServicePeer(server, 201, 202);
        const callee = new ServicePeer(server, 202, 201);

        await caller.startCall();
        await pump();
        await callee.acceptCall();
        await waitUntil(() => {
            expect(caller.status).toBe('active');
            expect(callee.status).toBe('active');
        });

        for (let cycle = 0; cycle < 5; cycle += 1) {
            await caller.startScreenShare();
            await waitUntil(() => expect(caller.internal.isRenegotiationInFlight).toBe(false));
            await caller.stopScreenShare();
            await waitUntil(() => expect(caller.internal.isRenegotiationInFlight).toBe(false));
        }

        expect(server.rejections).toEqual([]);
    });

    it('times out a withheld renegotiation answer without leaving have-local-offer behind', async () => {
        const server = new FakeCallServer();
        const caller = new ServicePeer(server, 301, 302);
        const callee = new ServicePeer(server, 302, 301);

        await caller.startCall();
        await pump();
        await callee.acceptCall();
        await waitUntil(() => {
            expect(caller.status).toBe('active');
            expect(callee.status).toBe('active');
        });

        server.holdNextRenegotiationAnswer = true;
        await caller.startScreenShare();
        await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS);
        await pump();

        expect(caller.internal.isRenegotiationInFlight).toBe(false);
        expect(caller.peerConnection?.signalingState).toBe('stable');
        expect(caller.internal.renegotiationAnswerTimeoutRef).toBeNull();
        expect(caller.internal.screenStream).toBeNull();

        server.releaseHeldDeliveries();
        await pump();
    });
});
