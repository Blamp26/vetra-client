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

import {
    WebRTCService,
    buildIceServers,
    classifyCandidateType,
    inspectSelectedCandidatePairFromStats,
} from './webrtcService';

class MockMediaStream {
    getTracks = vi.fn(() => []);
    getAudioTracks = vi.fn(() => []);
    getVideoTracks = vi.fn(() => []);
}
global.MediaStream = MockMediaStream as any;

class MockRTCSessionDescription {
    type: string;
    sdp?: string;

    constructor(init: { type: string; sdp?: string }) {
        this.type = init.type;
        this.sdp = init.sdp;
    }
}

class MockRTCIceCandidate {
    candidate?: string;
    sdpMid?: string;
    sdpMLineIndex?: number;

    constructor(init: { candidate?: string; sdpMid?: string; sdpMLineIndex?: number }) {
        this.candidate = init.candidate;
        this.sdpMid = init.sdpMid ?? undefined;
        this.sdpMLineIndex = init.sdpMLineIndex ?? undefined;
    }
}

global.RTCSessionDescription = MockRTCSessionDescription as any;
global.RTCIceCandidate = MockRTCIceCandidate as any;

function createMockStatsReport(values: Array<Record<string, unknown>>) {
    const statsMap = new Map<string, Record<string, unknown>>();
    values.forEach((value, index) => {
        const id = String(value.id ?? `stat-${index}`);
        statsMap.set(id, { ...value, id });
    });
    return {
        values: () => statsMap.values(),
    };
}

class MockRTCPeerConnection {
    config: RTCConfiguration;
    connectionState: RTCPeerConnectionState = 'new';
    iceConnectionState: RTCIceConnectionState = 'new';
    iceGatheringState: RTCIceGatheringState = 'new';
    signalingState: RTCSignalingState = 'stable';
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    ontrack: ((event: RTCTrackEvent) => void) | null = null;
    onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    oniceconnectionstatechange: (() => void) | null = null;
    onicegatheringstatechange: (() => void) | null = null;
    onsignalingstatechange: (() => void) | null = null;

    statsReport = createMockStatsReport([]);
    getStats?: ReturnType<typeof vi.fn> = vi.fn(async () => this.statsReport);
    createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-offer' });
    createAnswer = vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-answer' });
    setLocalDescription = vi.fn((desc: RTCSessionDescriptionInit) => {
        this.localDescription = desc;
        if (desc.type === 'offer') {
            this.signalingState = 'have-local-offer';
        } else if (desc.type === 'answer') {
            this.signalingState = 'stable';
        }
        this.onsignalingstatechange?.();
        if (this.onicecandidate) {
            setTimeout(() => {
                this.onicecandidate!({ candidate: { candidate: 'mock-candidate', sdpMid: '0', sdpMLineIndex: 0 } } as any);
                this.onicecandidate!({ candidate: null } as any);
            }, 0);
        }
        return Promise.resolve();
    });
    setRemoteDescription = vi.fn((desc: RTCSessionDescriptionInit) => {
        this.remoteDescription = desc;
        if (desc.type === 'offer') {
            this.signalingState = 'have-remote-offer';
        } else if (desc.type === 'answer') {
            this.signalingState = 'stable';
        }
        this.onsignalingstatechange?.();
        return Promise.resolve();
    });
    addIceCandidate = vi.fn().mockResolvedValue(undefined);
    addTrack = vi.fn((track: MediaStreamTrack) => ({
        track,
        replaceTrack: vi.fn().mockResolvedValue(undefined),
    }));
    addTransceiver = vi.fn((track: MediaStreamTrack, init?: RTCRtpTransceiverInit) => ({
        direction: init?.direction ?? 'sendrecv',
        sender: {
            track,
            replaceTrack: vi.fn().mockResolvedValue(undefined),
        },
    }));
    removeTrack = vi.fn();
    receivers: Array<{ track: MediaStreamTrack }> = [];
    getReceivers = vi.fn(() => this.receivers);
    close = vi.fn();

    constructor(config: RTCConfiguration) {
        this.config = config;
    }
}

let mockLocalTracks: Array<{ enabled: boolean; stop: ReturnType<typeof vi.fn> }>;
let mockAudioTracks: Array<{ enabled: boolean; stop: ReturnType<typeof vi.fn> }>;
let mockScreenTrack: {
    kind: string;
    enabled: boolean;
    stop: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
};
let mockScreenStream: {
    getTracks: ReturnType<typeof vi.fn>;
    getAudioTracks: ReturnType<typeof vi.fn>;
    getVideoTracks: ReturnType<typeof vi.fn>;
};

const mockGetUserMedia = vi.fn(async () => ({
    getTracks: () => mockLocalTracks,
    getAudioTracks: () => mockAudioTracks,
}));

const mockGetDisplayMedia = vi.fn(async () => mockScreenStream);

const mockChannelPush = vi.fn().mockReturnValue({
    receive: vi.fn((event, cb) => {
        if (event === 'ok') cb({ call_id: '123:456' });
        return { receive: vi.fn() };
    }),
});

const mockChannel = {
    push: mockChannelPush,
} as unknown as Channel;

function renegotiationPushes(type?: 'offer' | 'answer') {
    return mockChannelPush.mock.calls.filter(([event, payload]) => (
        event === 'renegotiate' &&
        (!type || payload?.type === type)
    ));
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    localStorage.removeItem('vetra.debug.calls');
    mockAppState.selectedInputDeviceId = 'default';
    mockAppState.noiseSuppression = true;
    mockAppState.echoCancellation = true;
    mockAppState.autoGainControl = true;
    mockAudioTracks = [{ enabled: true, stop: vi.fn() }];
    mockLocalTracks = mockAudioTracks;
    mockScreenTrack = {
        kind: 'video',
        enabled: true,
        stop: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onended: null,
    };
    mockScreenStream = {
        getTracks: vi.fn(() => [mockScreenTrack]),
        getAudioTracks: vi.fn(() => []),
        getVideoTracks: vi.fn(() => [mockScreenTrack]),
    };

    (global as any).RTCPeerConnection = MockRTCPeerConnection as any;

    Object.defineProperty(global.navigator, 'mediaDevices', {
        value: { getUserMedia: mockGetUserMedia, getDisplayMedia: mockGetDisplayMedia },
        writable: true,
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('WebRTCService', () => {
    let service: WebRTCService;
    const localUserId = 1;
    const remoteUserId = 2;

    beforeEach(() => {
        service = new WebRTCService(mockChannel, localUserId, remoteUserId);
    });

    afterEach(() => {
        service.hangUp();
    });

    describe('startCall', () => {
        it('requests the microphone, creates an offer, and sends it to the channel', async () => {
            await service.startCall();

            expect(mockGetUserMedia).toHaveBeenCalledWith({
                audio: {
                    deviceId: undefined,
                    noiseSuppression: true,
                    echoCancellation: true,
                    autoGainControl: true,
                },
                video: false,
            });
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            expect(pc.createOffer).toHaveBeenCalled();
            expect(pc.config.iceServers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
            expect(pc.setLocalDescription).toHaveBeenCalledWith(expect.objectContaining({ type: 'offer' }));
            expect(mockChannelPush).toHaveBeenCalledWith('offer', {
                sdp: expect.any(String),
                to_user_id: remoteUserId,
            });
        });

        it('calls onCallIdReceived with the call id from the server response', async () => {
            const onCallId = vi.fn();
            service.onCallIdReceived = onCallId;

            await service.startCall();

            expect(onCallId).toHaveBeenCalledWith('123:456');
        });

        it('throws on a repeated startCall invocation', async () => {
            await service.startCall();

            await expect(service.startCall()).rejects.toThrow('Call already started');
        });

        it('surfaces getUserMedia errors', async () => {
            mockGetUserMedia.mockRejectedValueOnce(new Error('No mic'));

            await expect(service.startCall()).rejects.toThrow('No mic');
            expect((service as any).peerConnection).toBeNull();
        });

        it('passes selected device and requested audio processing constraints into getUserMedia', async () => {
            mockAppState.selectedInputDeviceId = 'mic-123';
            mockAppState.noiseSuppression = false;
            mockAppState.echoCancellation = true;
            mockAppState.autoGainControl = false;

            await service.startCall();

            expect(mockGetUserMedia).toHaveBeenCalledWith({
                audio: {
                    deviceId: { exact: 'mic-123' },
                    noiseSuppression: false,
                    echoCancellation: true,
                    autoGainControl: false,
                },
                video: false,
            });
        });
    });

    describe('acceptCall', () => {
        const remoteSdp = 'mock-remote-offer';

        it('requests the microphone, sets remote description, creates an answer, and sends it', async () => {
            await service.acceptCall(remoteSdp);

            expect(mockGetUserMedia).toHaveBeenCalled();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            expect(pc.setRemoteDescription).toHaveBeenCalledWith(
                new RTCSessionDescription({ type: 'offer', sdp: remoteSdp })
            );
            expect(pc.createAnswer).toHaveBeenCalled();
            expect(pc.setLocalDescription).toHaveBeenCalledWith(expect.objectContaining({ type: 'answer' }));
            expect(mockChannelPush).toHaveBeenCalledWith('answer', {
                sdp: expect.any(String),
                to_user_id: remoteUserId,
                call_id: expect.stringContaining(':'),
            });
        });

        it('throws on a repeated acceptCall invocation', async () => {
            await service.acceptCall(remoteSdp);

            await expect(service.acceptCall(remoteSdp)).rejects.toThrow('Call already accepted');
        });
    });

    describe('handleAnswer', () => {
        it('sets remote description and flushes queued ICE candidates', async () => {
            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;

            await service.addIceCandidate({ candidate: 'candidate1' });
            await service.addIceCandidate({ candidate: 'candidate2' });
            await service.handleAnswer('mock-answer-sdp');

            expect(pc.setRemoteDescription).toHaveBeenCalledWith(
                new RTCSessionDescription({ type: 'answer', sdp: 'mock-answer-sdp' })
            );
            expect(pc.addIceCandidate).toHaveBeenCalledTimes(2);
            expect((service as any).iceCandidateQueue).toEqual([]);
        });
    });

    describe('ICE queue', () => {
        it('queues candidates until the remote description is set', async () => {
            await service.startCall();
            await service.addIceCandidate({ candidate: 'c1' });
            await service.addIceCandidate({ candidate: 'c2' });

            expect((service as any).iceCandidateQueue).toHaveLength(2);
        });

        it('flushes the queue after handleAnswer', async () => {
            await service.startCall();
            await service.addIceCandidate({ candidate: 'c1' });
            await service.handleAnswer('answer');

            expect((service as any).iceCandidateQueue).toHaveLength(0);
        });

        it('adds ICE immediately after acceptCall sets the remote description', async () => {
            await service.acceptCall('offer-sdp');
            await service.addIceCandidate({ candidate: 'c1' });
            await service.addIceCandidate({ candidate: 'c2' });

            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            expect(pc.addIceCandidate).toHaveBeenCalledTimes(2);
            expect((service as any).iceCandidateQueue).toEqual([]);
        });

        it('deduplicates queued ICE candidates before the remote description is set', async () => {
            await service.startCall();
            await service.addIceCandidate({ candidate: 'c1', sdpMid: '0', sdpMLineIndex: 0 });
            await service.addIceCandidate({ candidate: 'c1', sdpMid: '0', sdpMLineIndex: 0 });

            expect((service as any).iceCandidateQueue).toHaveLength(1);

            await service.handleAnswer('answer');

            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            expect(pc.addIceCandidate).toHaveBeenCalledTimes(1);
        });

        it('queues out-of-order OperationError candidates without noisy console errors', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            await service.acceptCall('offer-sdp');
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            pc.addIceCandidate.mockRejectedValueOnce(new DOMException('ufrag mismatch', 'OperationError'));

            await service.addIceCandidate({ candidate: 'early-renegotiation-candidate', sdpMid: '0', sdpMLineIndex: 0 });

            expect((service as any).iceCandidateQueue).toHaveLength(1);
            expect(consoleSpy).not.toHaveBeenCalledWith('[WebRTC] Failed to add ICE candidate:', expect.anything());
        });

        it('applies a renegotiation offer and answers over the renegotiate event', async () => {
            await service.acceptCall('initial-offer-sdp');
            mockChannelPush.mockClear();

            await service.handleRenegotiation({
                sdp: 'renegotiation-offer-sdp',
                type: 'offer',
            });

            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            expect(pc.setRemoteDescription).toHaveBeenCalledWith(
                new RTCSessionDescription({ type: 'offer', sdp: 'renegotiation-offer-sdp' }),
            );
            expect(pc.createAnswer).toHaveBeenCalled();
            expect(mockChannelPush).toHaveBeenCalledWith('renegotiate', {
                to_user_id: remoteUserId,
                call_id: expect.stringContaining(':'),
                sdp: expect.any(String),
                type: 'answer',
            });
        });

        it('applies a renegotiation answer to the existing peer', async () => {
            await service.startCall();
            await service.handleAnswer('initial-answer-sdp');
            await service.startScreenShare();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;

            await service.handleRenegotiation({
                sdp: 'renegotiation-answer-sdp',
                type: 'answer',
            });

            expect(pc.setRemoteDescription).toHaveBeenLastCalledWith(
                new RTCSessionDescription({ type: 'answer', sdp: 'renegotiation-answer-sdp' }),
            );
            expect(pc.signalingState).toBe('stable');
        });

        it('does not treat ICE candidates as renegotiation signals', async () => {
            await service.acceptCall('initial-offer-sdp');
            mockChannelPush.mockClear();

            await service.addIceCandidate({
                candidate: JSON.stringify({
                    __vetra_call_signal: 'renegotiation_offer',
                    sdp: expect.any(String),
                    type: 'offer',
                }),
            });

            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            expect(pc.addIceCandidate).toHaveBeenCalledTimes(1);
            expect(mockChannelPush).not.toHaveBeenCalledWith('renegotiate', expect.anything());
        });
    });

    describe('local media controls', () => {
        it('setLocalMuted updates local audio track enabled state', async () => {
            await service.startCall();

            service.setLocalMuted(true);
            expect(service.isLocalMuted()).toBe(true);
            expect(service.getLocalAudioTracks()[0]?.enabled).toBe(false);

            service.setLocalMuted(false);
            expect(service.isLocalMuted()).toBe(false);
            expect(service.getLocalAudioTracks()[0]?.enabled).toBe(true);
        });

        it('toggleLocalMuted returns the new mute state', async () => {
            await service.startCall();

            expect(service.toggleLocalMuted()).toBe(true);
            expect(service.isLocalMuted()).toBe(true);
            expect(service.getLocalAudioTracks()[0]?.enabled).toBe(false);

            expect(service.toggleLocalMuted()).toBe(false);
            expect(service.isLocalMuted()).toBe(false);
            expect(service.getLocalAudioTracks()[0]?.enabled).toBe(true);
        });

        it('does not throw when no local stream exists', () => {
            expect(() => service.setLocalMuted(true)).not.toThrow();
            expect(service.isLocalMuted()).toBe(true);
            expect(() => service.toggleLocalMuted()).not.toThrow();
            expect(service.isLocalMuted()).toBe(false);
            expect(service.getLocalAudioTracks()).toEqual([]);
        });

        it('applies the current mute state to tracks created after muting', async () => {
            service.setLocalMuted(true);

            await service.startCall();

            expect(service.isLocalMuted()).toBe(true);
            expect(service.getLocalAudioTracks()[0]?.enabled).toBe(false);
        });
    });

    describe('screen sharing', () => {
        it('startScreenShare gets display media, attaches the screen track, and sends a renegotiation offer', async () => {
            await service.startCall();
            await service.handleAnswer('answer-sdp');
            mockChannelPush.mockClear();

            const stream = await service.startScreenShare();

            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            expect(stream).toBe(mockScreenStream);
            expect(mockGetDisplayMedia).toHaveBeenCalledWith({
                video: true,
                audio: false,
            });
            expect(pc.addTransceiver).toHaveBeenCalledWith(mockScreenTrack, {
                direction: 'sendonly',
                streams: [mockScreenStream],
            });
            expect(pc.createOffer).toHaveBeenCalledTimes(2);
            expect(mockChannelPush).toHaveBeenCalledWith('renegotiate', {
                to_user_id: remoteUserId,
                call_id: '123:456',
                screen_share_active: true,
                sdp: expect.any(String),
                type: 'offer',
            });
        });

        it('startScreenShare queues renegotiation instead of creating an offer while signaling is not stable', async () => {
            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            expect(pc.signalingState).toBe('have-local-offer');
            mockChannelPush.mockClear();

            const startPromise = service.startScreenShare();

            expect(pc.addTransceiver).not.toHaveBeenCalled();
            expect(pc.createOffer).toHaveBeenCalledTimes(1);
            expect(mockChannelPush).not.toHaveBeenCalledWith('offer', expect.objectContaining({
                call_id: expect.any(String),
            }));
            expect((service as any).pendingScreenShareChange).toBe(true);
            expect((service as any).desiredScreenShareActive).toBe(true);

            await service.handleAnswer('answer-sdp');
            await expect(startPromise).resolves.toBe(mockScreenStream);

            await vi.waitFor(() => {
                expect(mockChannelPush).toHaveBeenCalledWith('renegotiate', expect.objectContaining({
                    to_user_id: remoteUserId,
                    call_id: '123:456',
                    screen_share_active: true,
                    sdp: expect.any(String),
                    type: 'offer',
                }));
            });
            expect(pc.createOffer).toHaveBeenCalledTimes(2);
        });

        it('startScreenShare does not create repeated offers while signaling remains have-local-offer', async () => {
            await service.startCall();
            mockChannelPush.mockClear();

            void service.startScreenShare().catch(() => undefined);
            void service.startScreenShare().catch(() => undefined);

            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            expect(pc.signalingState).toBe('have-local-offer');
            expect(pc.createOffer).toHaveBeenCalledTimes(1);
            expect(pc.addTransceiver).not.toHaveBeenCalled();
            expect(mockChannelPush).not.toHaveBeenCalledWith('offer', expect.objectContaining({
                call_id: expect.any(String),
            }));
            expect((service as any).pendingScreenShareChange).toBe(true);
            expect((service as any).desiredScreenShareActive).toBe(true);
        });

        it('stopScreenShare removes the sender and renegotiates without disposing the peer', async () => {
            await service.startCall();
            await service.handleAnswer('answer-sdp');
            const pc = (service as any).peerConnection as MockRTCPeerConnection;

            await service.startScreenShare();
            await service.handleAnswer('screen-answer-sdp');
            const sender = (service as any).screenSender;
            mockChannelPush.mockClear();

            await service.stopScreenShare();

            expect(sender.replaceTrack).toHaveBeenCalledWith(null);
            expect(pc.removeTrack).not.toHaveBeenCalled();
            expect(mockScreenTrack.stop).toHaveBeenCalled();
            expect(pc.close).not.toHaveBeenCalled();
            expect((service as any).peerConnection).toBe(pc);
            expect((service as any).screenTransceiver.direction).toBe('inactive');
            expect(mockChannelPush).toHaveBeenCalledWith('renegotiate', expect.objectContaining({
                to_user_id: remoteUserId,
                screen_share_active: false,
                sdp: expect.any(String),
                type: 'offer',
            }));
        });

        it('applying a renegotiation answer does not trigger another offer by itself', async () => {
            await service.startCall();
            await service.handleAnswer('answer-sdp');
            await service.startScreenShare();
            mockChannelPush.mockClear();

            await service.handleAnswer('screen-answer-sdp');

            expect(renegotiationPushes('offer')).toHaveLength(0);
            expect((service as any).pendingRenegotiationReason).toBeNull();
        });

        it('start stop start triggers exactly three intended renegotiation offers', async () => {
            await service.startCall();
            await service.handleAnswer('answer-sdp');
            mockChannelPush.mockClear();

            await service.startScreenShare();
            await service.handleAnswer('screen-start-answer-sdp');
            await service.stopScreenShare();
            await service.handleAnswer('screen-stop-answer-sdp');
            await service.startScreenShare();

            const renegotiationOffers = renegotiationPushes('offer');
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            const sender = (service as any).screenSender;

            expect(renegotiationOffers).toHaveLength(3);
            expect(pc.addTransceiver).toHaveBeenCalledTimes(1);
            expect(sender.replaceTrack).toHaveBeenCalledWith(null);
            expect(sender.replaceTrack).toHaveBeenCalledWith(mockScreenTrack);
            expect((service as any).screenTransceiver.direction).toBe('sendonly');
        });

        it('stop while start renegotiation is in flight queues one follow-up stop after the answer', async () => {
            await service.startCall();
            await service.handleAnswer('answer-sdp');
            mockChannelPush.mockClear();

            await service.startScreenShare();
            const sender = (service as any).screenSender;

            await service.stopScreenShare();

            let renegotiationOffers = renegotiationPushes('offer');
            expect(renegotiationOffers).toHaveLength(1);
            expect(renegotiationOffers[0]?.[1].screen_share_active).toBe(true);
            expect(sender.replaceTrack).not.toHaveBeenCalledWith(null);
            expect((service as any).desiredScreenShareActive).toBe(false);
            expect((service as any).pendingScreenShareChange).toBe(true);

            await service.handleAnswer('screen-start-answer-sdp');

            await vi.waitFor(() => {
                renegotiationOffers = renegotiationPushes('offer');
                expect(renegotiationOffers).toHaveLength(2);
            });
            expect(renegotiationOffers[1]?.[1].screen_share_active).toBe(false);
            expect(sender.replaceTrack).toHaveBeenCalledWith(null);
        });

        it('rapid start stop start while unstable applies only the latest desired start after the answer', async () => {
            await service.startCall();
            const firstStart = service.startScreenShare().catch(() => null);

            await service.stopScreenShare();
            const secondStart = service.startScreenShare();

            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            expect(pc.addTransceiver).not.toHaveBeenCalled();
            expect(mockGetDisplayMedia).not.toHaveBeenCalled();
            expect((service as any).desiredScreenShareActive).toBe(true);
            expect((service as any).pendingScreenShareChange).toBe(true);

            await service.handleAnswer('initial-answer-sdp');

            await expect(firstStart).resolves.toBeNull();
            await expect(secondStart).resolves.toBe(mockScreenStream);

            const renegotiationOffers = renegotiationPushes('offer');
            expect(renegotiationOffers).toHaveLength(1);
            expect(renegotiationOffers[0]?.[1].screen_share_active).toBe(true);
            expect(pc.addTransceiver).toHaveBeenCalledWith(mockScreenTrack, {
                direction: 'sendonly',
                streams: [mockScreenStream],
            });
            expect(mockGetDisplayMedia).toHaveBeenCalledTimes(1);
        });

        it('screen track ended cleans up through the provided callback without disposing the peer', async () => {
            const onEnded = vi.fn();
            await service.startCall();
            await service.handleAnswer('answer-sdp');
            const pc = (service as any).peerConnection as MockRTCPeerConnection;

            await service.startScreenShare(onEnded);
            const endedHandler = mockScreenTrack.addEventListener.mock.calls.find(([event]) => event === 'ended')?.[1];
            expect(endedHandler).toEqual(expect.any(Function));

            endedHandler?.();

            await vi.waitFor(() => {
                expect(onEnded).toHaveBeenCalled();
            });
            expect(mockScreenTrack.stop).not.toHaveBeenCalled();
            expect(pc.close).not.toHaveBeenCalled();
            expect((service as any).desiredScreenShareActive).toBe(false);
            expect((service as any).pendingScreenShareChange).toBe(true);
            expect((service as any).screenStream).toBe(mockScreenStream);

            await service.handleAnswer('screen-start-answer-sdp');

            expect((service as any).screenStream).toBeNull();
        });

        it('dispose stops an active screen track', async () => {
            await service.startCall();
            await service.handleAnswer('answer-sdp');
            await service.startScreenShare();

            service.dispose();

            expect(mockScreenTrack.stop).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('closes the peer connection, stops tracks, and clears ICE state', async () => {
            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;

            service.dispose();

            expect(pc.close).toHaveBeenCalled();
            expect(mockLocalTracks[0]?.stop).toHaveBeenCalled();
            expect((service as any).iceCandidateQueue).toEqual([]);
            expect((service as any).remoteDescriptionSet).toBe(false);
        });

        it('is safe to call multiple times', async () => {
            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;

            service.dispose();
            service.dispose();

            expect(pc.close).toHaveBeenCalledTimes(1);
            expect(mockLocalTracks[0]?.stop).toHaveBeenCalledTimes(1);
        });
    });

    describe('onRemoteStream', () => {
        it('invokes onRemoteStream when an ontrack event arrives', async () => {
            const onRemoteStream = vi.fn();
            service.onRemoteStream = onRemoteStream;

            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            const fakeStream = new MediaStream();

            if (pc.ontrack) {
                pc.ontrack({ streams: [fakeStream] } as any);
            }

            expect(onRemoteStream).toHaveBeenCalledWith(fakeStream);
        });

        it('invokes onRemoteScreenStream for remote video tracks and clears it on mute', async () => {
            const onRemoteScreenStream = vi.fn();
            service.onRemoteScreenStream = onRemoteScreenStream;

            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            const fakeStream = new MediaStream();
            const fakeTrack = {
                kind: 'video',
                id: 'remote-video-1',
                muted: false,
                readyState: 'live',
                onended: null as (() => void) | null,
                onmute: null as (() => void) | null,
                onunmute: null as (() => void) | null,
            };

            pc.ontrack?.({ streams: [fakeStream], track: fakeTrack } as any);

            expect(onRemoteScreenStream).toHaveBeenCalledWith(expect.any(MediaStream));

            fakeTrack.onmute?.();

            expect(onRemoteScreenStream).toHaveBeenLastCalledWith(null);
        });

        it('restores remote screen on unmute while remote screen share is active', async () => {
            const onRemoteScreenStream = vi.fn();
            service.onRemoteScreenStream = onRemoteScreenStream;

            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            const fakeStream = new MediaStream();
            const fakeTrack = {
                kind: 'video',
                id: 'remote-video-1',
                muted: false,
                readyState: 'live',
                onended: null as (() => void) | null,
                onmute: null as (() => void) | null,
                onunmute: null as (() => void) | null,
            };

            pc.ontrack?.({ streams: [fakeStream], track: fakeTrack } as any);
            fakeTrack.onmute?.();
            onRemoteScreenStream.mockClear();

            fakeTrack.onunmute?.();

            expect(onRemoteScreenStream).toHaveBeenCalledWith(expect.any(MediaStream));
        });

        it('clears remote screen when the remote video track ends', async () => {
            const onRemoteScreenStream = vi.fn();
            service.onRemoteScreenStream = onRemoteScreenStream;

            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            const fakeTrack = {
                kind: 'video',
                id: 'remote-video-1',
                muted: false,
                readyState: 'live',
                onended: null as (() => void) | null,
                onmute: null as (() => void) | null,
                onunmute: null as (() => void) | null,
            };

            pc.ontrack?.({ streams: [new MediaStream()], track: fakeTrack } as any);
            fakeTrack.onended?.();

            expect(onRemoteScreenStream).toHaveBeenLastCalledWith(null);
        });

        it('re-emits a fresh remote screen stream from an existing receiver after active renegotiation', async () => {
            const onRemoteScreenStream = vi.fn();
            service.onRemoteScreenStream = onRemoteScreenStream;

            await service.acceptCall('initial-offer-sdp');
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            const existingVideoTrack = {
                kind: 'video',
                id: 'remote-video-existing',
                muted: false,
                readyState: 'live',
                onended: null as (() => void) | null,
                onmute: null as (() => void) | null,
                onunmute: null as (() => void) | null,
            };
            pc.receivers = [{ track: existingVideoTrack as any }];
            onRemoteScreenStream.mockClear();

            await service.handleOffer([
                'v=0',
                'm=audio 9 UDP/TLS/RTP/SAVPF 111',
                'a=sendrecv',
                'm=video 9 UDP/TLS/RTP/SAVPF 96',
                'a=sendonly',
            ].join('\r\n'), { screenShareActive: true });

            expect(onRemoteScreenStream).toHaveBeenCalledTimes(1);
            expect(onRemoteScreenStream).toHaveBeenCalledWith(expect.any(MediaStream));
        });

        it('screenShareActive false clears remote screen immediately even with an existing receiver', async () => {
            const onRemoteScreenStream = vi.fn();
            service.onRemoteScreenStream = onRemoteScreenStream;

            await service.acceptCall('initial-offer-sdp');
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            pc.ontrack?.({
                streams: [new MediaStream()],
                track: {
                    kind: 'video',
                    id: 'remote-video-existing',
                    muted: false,
                    readyState: 'live',
                    onended: null,
                    onmute: null,
                    onunmute: null,
                },
            } as any);

            await service.handleOffer([
                'v=0',
                'm=audio 9 UDP/TLS/RTP/SAVPF 111',
                'a=sendrecv',
                'm=video 9 UDP/TLS/RTP/SAVPF 96',
                'a=recvonly',
            ].join('\r\n'), { screenShareActive: false });

            expect(onRemoteScreenStream).toHaveBeenLastCalledWith(null);
        });

        it('clears remote screen stream when a renegotiation offer no longer sends video', async () => {
            const onRemoteScreenStream = vi.fn();
            service.onRemoteScreenStream = onRemoteScreenStream;

            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            const fakeStream = new MediaStream();

            pc.ontrack?.({
                streams: [fakeStream],
                track: { kind: 'video', onended: null, onmute: null },
            } as any);

            await service.handleOffer([
                'v=0',
                'm=audio 9 UDP/TLS/RTP/SAVPF 111',
                'a=sendrecv',
                'm=video 9 UDP/TLS/RTP/SAVPF 96',
                'a=recvonly',
            ].join('\r\n'));

            expect(onRemoteScreenStream).toHaveBeenLastCalledWith(null);
            expect(mockChannelPush).toHaveBeenCalledWith('renegotiate', expect.objectContaining({
                to_user_id: remoteUserId,
                sdp: expect.any(String),
                type: 'answer',
            }));
        });
    });

    describe('ICE sending', () => {
        it('sends ICE candidates from onicecandidate', async () => {
            await service.startCall();

            await vi.waitFor(() => {
                expect(mockChannelPush).toHaveBeenCalledWith('ice_candidate', expect.objectContaining({
                    candidate: { candidate: 'mock-candidate', sdpMid: '0', sdpMLineIndex: 0 },
                    to_user_id: remoteUserId,
                    call_id: expect.any(String),
                }));
            });
        });
    });

    describe('ICE server config', () => {
        it('uses the default STUN-only config when TURN is not provided', () => {
            expect(buildIceServers()).toEqual([
                { urls: 'stun:stun.l.google.com:19302' },
            ]);
        });

        it('includes TURN when all TURN env values are configured', () => {
            vi.stubEnv('VITE_WEBRTC_STUN_URL', 'stun:stun.example.com:3478');
            vi.stubEnv('VITE_WEBRTC_TURN_URL', 'turn:turn.example.com:3478');
            vi.stubEnv('VITE_WEBRTC_TURN_USERNAME', 'turn-user');
            vi.stubEnv('VITE_WEBRTC_TURN_CREDENTIAL', 'turn-pass');

            expect(buildIceServers()).toEqual([
                { urls: 'stun:stun.example.com:3478' },
                {
                    urls: 'turn:turn.example.com:3478',
                    username: 'turn-user',
                    credential: 'turn-pass',
                },
            ]);
        });

        it('skips TURN when username or credential is missing', () => {
            vi.stubEnv('VITE_WEBRTC_STUN_URL', 'stun:stun.example.com:3478');
            vi.stubEnv('VITE_WEBRTC_TURN_URL', 'turn:turn.example.com:3478');
            vi.stubEnv('VITE_WEBRTC_TURN_USERNAME', '');
            vi.stubEnv('VITE_WEBRTC_TURN_CREDENTIAL', 'turn-pass');

            expect(buildIceServers()).toEqual([
                { urls: 'stun:stun.example.com:3478' },
            ]);
        });

        it('passes the expected iceServers into RTCPeerConnection', async () => {
            vi.stubEnv('VITE_WEBRTC_STUN_URL', 'stun:stun.example.com:3478');
            vi.stubEnv('VITE_WEBRTC_TURN_URL', 'turn:turn.example.com:3478');
            vi.stubEnv('VITE_WEBRTC_TURN_USERNAME', 'turn-user');
            vi.stubEnv('VITE_WEBRTC_TURN_CREDENTIAL', 'turn-pass');

            await service.startCall();

            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            expect(pc.config.iceServers).toEqual([
                { urls: 'stun:stun.example.com:3478' },
                {
                    urls: 'turn:turn.example.com:3478',
                    username: 'turn-user',
                    credential: 'turn-pass',
                },
            ]);
        });
    });

    describe('diagnostics', () => {
        it('classifies candidate types correctly', () => {
            expect(classifyCandidateType('host')).toBe('host');
            expect(classifyCandidateType('srflx')).toBe('srflx');
            expect(classifyCandidateType('relay')).toBe('relay');
            expect(classifyCandidateType('prflx')).toBe('unknown');
        });

        it('identifies the selected candidate pair from stats', () => {
            const selectedPair = inspectSelectedCandidatePairFromStats(createMockStatsReport([
                {
                    id: 'pair-1',
                    type: 'candidate-pair',
                    state: 'succeeded',
                    nominated: true,
                    localCandidateId: 'local-1',
                    remoteCandidateId: 'remote-1',
                },
                {
                    id: 'local-1',
                    type: 'local-candidate',
                    candidateType: 'relay',
                },
                {
                    id: 'remote-1',
                    type: 'remote-candidate',
                    candidateType: 'srflx',
                },
            ]));

            expect(selectedPair).toEqual({
                candidatePairId: 'pair-1',
                localCandidateId: 'local-1',
                remoteCandidateId: 'remote-1',
                localCandidateType: 'relay',
                state: 'succeeded',
                nominated: true,
            });
        });

        it('does not throw when getStats is missing', async () => {
            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection & { getStats?: () => Promise<unknown> };
            pc.getStats = undefined;

            await expect(service.collectDiagnostics()).resolves.toMatchObject({
                connectionState: 'new',
                iceConnectionState: 'new',
                iceGatheringState: 'new',
                signalingState: 'have-local-offer',
                selectedCandidatePair: null,
            });
        });

        it('does not throw when getStats fails', async () => {
            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            if (!pc.getStats) {
                throw new Error('Expected getStats to be defined for this test');
            }
            pc.getStats.mockRejectedValueOnce(new Error('stats failed'));

            await expect(service.collectDiagnostics()).resolves.toMatchObject({
                selectedCandidatePair: null,
            });
        });

        it('updates diagnostics on state transitions', async () => {
            const onDiagnosticsChange = vi.fn();
            service.onDiagnosticsChange = onDiagnosticsChange;

            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            pc.connectionState = 'connected';
            pc.iceConnectionState = 'connected';
            pc.iceGatheringState = 'complete';
            pc.signalingState = 'stable';
            pc.statsReport = createMockStatsReport([
                {
                    id: 'pair-1',
                    type: 'candidate-pair',
                    state: 'succeeded',
                    nominated: true,
                    localCandidateId: 'local-1',
                    remoteCandidateId: 'remote-1',
                },
                {
                    id: 'local-1',
                    type: 'local-candidate',
                    candidateType: 'srflx',
                },
            ]);

            pc.onconnectionstatechange?.();
            await vi.waitFor(() => {
                expect(onDiagnosticsChange).toHaveBeenLastCalledWith(expect.objectContaining({
                    connectionState: 'connected',
                    iceConnectionState: 'connected',
                    iceGatheringState: 'complete',
                    signalingState: 'stable',
                    selectedCandidatePair: expect.objectContaining({
                        localCandidateType: 'srflx',
                    }),
                }));
            });
        });

        it('does not include TURN credentials in diagnostic output', async () => {
            vi.stubEnv('VITE_WEBRTC_TURN_URL', 'turn:turn.example.com:3478');
            vi.stubEnv('VITE_WEBRTC_TURN_USERNAME', 'turn-user');
            vi.stubEnv('VITE_WEBRTC_TURN_CREDENTIAL', 'turn-pass');
            localStorage.setItem('vetra.debug.calls', '1');
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            pc.statsReport = createMockStatsReport([
                {
                    id: 'pair-1',
                    type: 'candidate-pair',
                    state: 'succeeded',
                    nominated: true,
                    localCandidateId: 'local-1',
                },
                {
                    id: 'local-1',
                    type: 'local-candidate',
                    candidateType: 'relay',
                },
            ]);
            pc.onconnectionstatechange?.();

            await vi.waitFor(() => {
                expect(consoleSpy).toHaveBeenCalled();
            });

            const loggedDiagnostics = consoleSpy.mock.calls
                .filter(([label]) => label === '[WebRTC] diagnostics')
                .map(([, payload]) => JSON.stringify(payload));

            expect(loggedDiagnostics.join(' ')).not.toContain('turn-user');
            expect(loggedDiagnostics.join(' ')).not.toContain('turn-pass');
            expect(loggedDiagnostics.join(' ')).not.toContain('credential');
            expect(loggedDiagnostics.join(' ')).not.toContain('username');
            localStorage.removeItem('vetra.debug.calls');
        });
    });
});
