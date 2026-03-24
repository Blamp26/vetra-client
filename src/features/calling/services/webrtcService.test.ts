import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WebRTCService } from './webrtcService';
import type { Channel } from 'phoenix';

// ----------------------------------------------------------------------
// Мок MediaStream для jsdom
// ----------------------------------------------------------------------
class MockMediaStream {
    getTracks = vi.fn(() => []);
    getAudioTracks = vi.fn(() => []);
}
global.MediaStream = MockMediaStream as any;

// ----------------------------------------------------------------------
// Мок RTCSessionDescription и RTCIceCandidate для WebRTC
// ----------------------------------------------------------------------
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

// ----------------------------------------------------------------------
// Мок RTCPeerConnection
// ----------------------------------------------------------------------
class MockRTCPeerConnection {
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    iceCandidates: RTCIceCandidateInit[] = [];
    ontrack: ((event: RTCTrackEvent) => void) | null = null;
    onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;

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
}

const mockGetUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
    getAudioTracks: () => [{ enabled: true }],
});

const mockChannelPush = vi.fn().mockReturnValue({
    receive: vi.fn((event, cb) => {
        if (event === 'ok') cb({ call_id: '123:456' });
        return { receive: vi.fn() };
    }),
});

const mockChannel = {
    push: mockChannelPush,
} as unknown as Channel;

// ----------------------------------------------------------------------
// Глобальные моки
// ----------------------------------------------------------------------
beforeEach(() => {
    vi.clearAllMocks();

    (global as any).RTCPeerConnection = MockRTCPeerConnection as any;

    Object.defineProperty(global.navigator, 'mediaDevices', {
        value: { getUserMedia: mockGetUserMedia },
        writable: true,
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ----------------------------------------------------------------------
// Тесты
// ----------------------------------------------------------------------
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
        it('запрашивает микрофон, создаёт offer и отправляет его в канал', async () => {
            await service.startCall();

            expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            expect(pc.createOffer).toHaveBeenCalled();
            expect(pc.setLocalDescription).toHaveBeenCalledWith(expect.objectContaining({ type: 'offer' }));
            expect(mockChannelPush).toHaveBeenCalledWith('offer', {
                sdp: expect.any(String),
                to_user_id: remoteUserId,
            });
        });

        it('вызывает onCallIdReceived с call_id из ответа сервера', async () => {
            const onCallId = vi.fn();
            service.onCallIdReceived = onCallId;
            await service.startCall();
            expect(onCallId).toHaveBeenCalledWith('123:456');
        });

        it('выбрасывает ошибку при повторном вызове', async () => {
            await service.startCall();
            await expect(service.startCall()).rejects.toThrow('Call already started');
        });

        it('обрабатывает ошибку getUserMedia', async () => {
            mockGetUserMedia.mockRejectedValueOnce(new Error('No mic'));
            await expect(service.startCall()).rejects.toThrow('No mic');
            expect((service as any).peerConnection).toBeNull();
        });
    });

    describe('acceptCall', () => {
        const remoteSdp = 'mock-remote-offer';

        it('запрашивает микрофон, устанавливает remote description, создаёт answer и отправляет', async () => {
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

        it('выбрасывает ошибку при повторном вызове', async () => {
            await service.acceptCall(remoteSdp);
            await expect(service.acceptCall(remoteSdp)).rejects.toThrow('Call already accepted');
        });
    });

    describe('handleAnswer', () => {
        it('устанавливает remote description и сбрасывает очередь ICE', async () => {
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

    describe('ICE очередь', () => {
        it('сохраняет кандидатов до установки remote description', async () => {
            await service.startCall();
            await service.addIceCandidate({ candidate: 'c1' });
            await service.addIceCandidate({ candidate: 'c2' });
            expect((service as any).iceCandidateQueue).toHaveLength(2);
        });

        it('сбрасывает очередь после handleAnswer', async () => {
            await service.startCall();
            await service.addIceCandidate({ candidate: 'c1' });
            await service.handleAnswer('answer');
            expect((service as any).iceCandidateQueue).toHaveLength(0);
        });

        it('сбрасывает очередь после acceptCall', async () => {
            await service.acceptCall('offer-sdp');
            await service.addIceCandidate({ candidate: 'c1' });
            await service.addIceCandidate({ candidate: 'c2' });
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            expect(pc.addIceCandidate).toHaveBeenCalledTimes(2);
            expect((service as any).iceCandidateQueue).toEqual([]);
        });
    });

    describe('hangUp', () => {
        it('закрывает peerConnection, останавливает треки и очищает очередь', async () => {
            await service.startCall();
            const pc = (service as any).peerConnection as MockRTCPeerConnection;
            const stream = (service as any).localStream;
            const stopMock = vi.fn();
            stream.getTracks = () => [{ stop: stopMock }];

            service.hangUp();

            expect(pc.close).toHaveBeenCalled();
            expect(stopMock).toHaveBeenCalled();
            expect((service as any).iceCandidateQueue).toEqual([]);
            expect((service as any).remoteDescriptionSet).toBe(false);
        });
    });

    describe('onRemoteStream', () => {
        it('вызывается при ontrack событии', async () => {
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

    describe('ICE отправка', () => {
        it('отправляет ICE кандидата при onicecandidate', async () => {
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
});