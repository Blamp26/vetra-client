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
        return Promise.resolve();
    });
    addIceCandidate = vi.fn().mockResolvedValue(undefined);
    addTrack = vi.fn();
    close = vi.fn();

    constructor(config: RTCConfiguration) {
        this.config = config;
    }
}

let mockLocalTracks: Array<{ enabled: boolean; stop: ReturnType<typeof vi.fn> }>;
let mockAudioTracks: Array<{ enabled: boolean; stop: ReturnType<typeof vi.fn> }>;

const mockGetUserMedia = vi.fn(async () => ({
    getTracks: () => mockLocalTracks,
    getAudioTracks: () => mockAudioTracks,
}));

const mockChannelPush = vi.fn().mockReturnValue({
    receive: vi.fn((event, cb) => {
        if (event === 'ok') cb({ call_id: '123:456' });
        return { receive: vi.fn() };
    }),
});

const mockChannel = {
    push: mockChannelPush,
} as unknown as Channel;

beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockAppState.selectedInputDeviceId = 'default';
    mockAppState.noiseSuppression = true;
    mockAppState.echoCancellation = true;
    mockAppState.autoGainControl = true;
    mockAudioTracks = [{ enabled: true, stop: vi.fn() }];
    mockLocalTracks = mockAudioTracks;

    (global as any).RTCPeerConnection = MockRTCPeerConnection as any;

    Object.defineProperty(global.navigator, 'mediaDevices', {
        value: { getUserMedia: mockGetUserMedia },
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
                signalingState: 'stable',
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
        });
    });
});
