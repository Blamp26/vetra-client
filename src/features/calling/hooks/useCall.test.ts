import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCall } from './useCall';
import { useAppStore } from "@/store";
import { callSignalingService } from '../services/callSignalingService';

// ----------------------------------------------------------------------
// Моки модулей
// ----------------------------------------------------------------------
vi.mock('@/store', () => ({
    useAppStore: vi.fn(),
}));

vi.mock('../services/webrtcService', () => {
    const MockWebRTCService = vi.fn().mockImplementation(function (this: any, _channel: any, _localUserId: number, _remoteUserId: number) {
        this._isLocalMuted = false;
        this._callId = null;
        this.startCall = vi.fn().mockResolvedValue(undefined);
        this.acceptCall = vi.fn().mockResolvedValue(undefined);
        this.handleAnswer = vi.fn().mockResolvedValue(undefined);
        this.handleOffer = vi.fn().mockResolvedValue(undefined);
        this.handleRenegotiation = vi.fn().mockResolvedValue(undefined);
        this.startScreenShare = vi.fn(async (onEnded?: () => void) => {
            this._screenStream?.getTracks?.().forEach((track: MediaStreamTrack) => track.stop());
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            });
            const track = stream.getVideoTracks?.()[0];
            if (track && onEnded) {
                track.addEventListener?.('ended', onEnded);
                track.onended = onEnded;
            }
            this._screenStream = stream;
            return stream;
        });
        this.stopScreenShare = vi.fn(async () => {
            this._screenStream?.getTracks?.().forEach((track: MediaStreamTrack) => track.stop());
            this._screenStream = null;
        });
        this.collectDiagnostics = vi.fn().mockResolvedValue({
            connectionState: 'unknown',
            iceConnectionState: 'unknown',
            iceGatheringState: 'unknown',
            signalingState: 'unknown',
            selectedCandidatePair: null,
        });
        this.addIceCandidate = vi.fn();
        this.hangUp = vi.fn();
        this.dispose = vi.fn(() => {
            this._screenStream?.getTracks?.().forEach((track: MediaStreamTrack) => track.stop());
            this._screenStream = null;
        });
        this.setCallId = vi.fn((callId: string | null) => {
            this._callId = callId;
        });
        this.getSignalingCallId = vi.fn(() => this._callId ?? 'fallback-call-id');
        this.setLocalMuted = vi.fn((muted: boolean) => {
            this._isLocalMuted = muted;
        });
        this.toggleLocalMuted = vi.fn(() => {
            this._isLocalMuted = !this._isLocalMuted;
            return this._isLocalMuted;
        });
        this.isLocalMuted = vi.fn(() => this._isLocalMuted);
        this.getLocalAudioTracks = vi.fn(() => []);
        this.onRemoteStream = null;
        this.onRemoteScreenStream = null;
        this.onRemoteScreenLoading = null;
        this.onScreenShareUpdatingChange = null;
        this.onCallIdReceived = null;
        this.onDiagnosticsChange = null;
        this.getDiagnosticsSnapshot = vi.fn().mockReturnValue({
            connectionState: 'unknown',
            iceConnectionState: 'unknown',
            iceGatheringState: 'unknown',
            signalingState: 'unknown',
            selectedCandidatePair: null,
        });
        return this;
    });
    return { WebRTCService: MockWebRTCService };
});

// ----------------------------------------------------------------------
// Глобальные переменные для моков
// ----------------------------------------------------------------------
let mockSocketManager: any;
let mockUserChannel: any;
let mockCallChannel: any;
let MockWebRTCService: any;
let mockStoreState: any;
let mockGetDisplayMedia: any;

beforeAll(async () => {
    const module = await import('../services/webrtcService');
    MockWebRTCService = module.WebRTCService;
});

const createMockChannel = () => ({
    on: vi.fn(),
    push: vi.fn(),
    join: vi.fn().mockReturnValue({
        receive: vi.fn((event: string, cb: Function) => {
            if (event === 'ok') cb();
            return { receive: vi.fn() };
        }),
    }),
    leave: vi.fn(),
    off: vi.fn(),
});

beforeEach(() => {
    callSignalingService.disconnect();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.useFakeTimers();

    MockWebRTCService.mockClear();

    mockUserChannel = {
        on: vi.fn().mockReturnValue(101),
        push: vi.fn(),
        off: vi.fn(),
    };
    mockCallChannel = createMockChannel();

    const mockChannelFn = vi.fn().mockReturnValue(mockCallChannel);

    mockSocketManager = {
        socket: { channel: mockChannelFn } as any,
        userChannel: mockUserChannel,
        onMessage: vi.fn(),
        onStatusUpdate: vi.fn(),
        onMessageEdited: vi.fn(),
        onMessageDeleted: vi.fn(),
        onDirectReactionUpdated: vi.fn(),
        onPresenceState: vi.fn(),
        onPresenceDiff: vi.fn(),
        onTypingStart: vi.fn(),
        onTypingStop: vi.fn(),
        onLastSeen: vi.fn(),
        onServerMemberAdded: vi.fn(),
        onServerMemberRemoved: vi.fn(),
        onServerDeleted: vi.fn(),
        onRoomMemberAdded: vi.fn(),
        onRoomMemberRemoved: vi.fn(),
        onRoomDeleted: vi.fn(),
        onChannelDeleted: vi.fn(),
        onRoomCreated: vi.fn(),
        onChannelCreated: vi.fn(),
        onRoomMessageGlobal: vi.fn(),
        updateStatus: vi.fn(),
        sendTypingStart: vi.fn(),
        sendTypingStop: vi.fn(),
        editMessage: vi.fn(),
        deleteMessage: vi.fn(),
        joinRoomChannel: vi.fn(),
        leaveRoomChannel: vi.fn(),
        sendRoomMessageViaChannel: vi.fn(),
        sendRoomTypingStart: vi.fn(),
        sendRoomTypingStop: vi.fn(),
        onRoomMessage: vi.fn(),
        onRoomTypingStart: vi.fn(),
        onRoomTypingStop: vi.fn(),
        onRoomMessageEdited: vi.fn(),
        onRoomMessageDeleted: vi.fn(),
        onRoomReactionUpdated: vi.fn(),
        editRoomMessage: vi.fn(),
        deleteRoomMessage: vi.fn(),
        toggleReaction: vi.fn(),
        toggleDirectReaction: vi.fn(),
        disconnect: vi.fn(),
    };

    mockStoreState = {
        currentUser: { id: 1 },
        socketManager: mockSocketManager,
    };

    mockGetDisplayMedia = vi.fn();
    Object.defineProperty(global.navigator, 'mediaDevices', {
        value: {
            getDisplayMedia: mockGetDisplayMedia,
        },
        writable: true,
    });

    (vi.mocked(useAppStore) as any).mockImplementation((selector: any) =>
        selector(mockStoreState)
    );
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useCall', () => {
    const currentUserId = 1;

    it('инициализирует состояние idle', () => {
        const { result } = renderHook(() => useCall(currentUserId));
        expect(result.current.status).toBe('idle');
        expect(result.current.remoteUserId).toBeNull();
        expect(result.current.callId).toBeNull();
        expect(result.current.isMuted).toBe(false);
        expect(result.current.remoteStream).toBeNull();
        expect(result.current.remoteScreenStream).toBeNull();
    });

    // УБРАЛИ async и waitFor
    it('при монтировании присоединяется к call каналу и подписывается на события', () => {
        const { unmount } = renderHook(() => useCall(currentUserId));

        expect(mockSocketManager.socket.channel).toHaveBeenCalledWith(`call:${currentUserId}`, {});
        expect(mockUserChannel.on).toHaveBeenCalledWith('incoming_call', expect.any(Function));

        const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
        expect(callChannel.on).toHaveBeenCalledWith('answer', expect.any(Function));
        expect(callChannel.on).toHaveBeenCalledWith('ice_candidate', expect.any(Function));
        expect(callChannel.on).toHaveBeenCalledWith('renegotiate', expect.any(Function));
        expect(callChannel.on).toHaveBeenCalledWith('hang_up', expect.any(Function));
        expect(callChannel.on).toHaveBeenCalledWith('offer', expect.any(Function));

        unmount();
        expect(callChannel.leave).toHaveBeenCalled();
        expect(mockUserChannel.off).toHaveBeenCalledWith('incoming_call', 101);
    });

    it('does not duplicate signaling listeners for the same socket initialization', () => {
        callSignalingService.initialize(mockSocketManager.socket, mockUserChannel, currentUserId);

        const firstCallChannel = mockSocketManager.socket.channel.mock.results[0].value;
        expect(firstCallChannel.on).toHaveBeenCalledTimes(5);
        expect(mockUserChannel.on).toHaveBeenCalledTimes(1);

        callSignalingService.initialize(mockSocketManager.socket, mockUserChannel, currentUserId);

        expect(mockSocketManager.socket.channel).toHaveBeenCalledTimes(1);
        expect(firstCallChannel.on).toHaveBeenCalledTimes(5);
        expect(mockUserChannel.on).toHaveBeenCalledTimes(1);
    });

    it('rebinds signaling listeners when a new socket is created for the same user', () => {
        callSignalingService.initialize(mockSocketManager.socket, mockUserChannel, currentUserId);

        const firstCallChannel = mockSocketManager.socket.channel.mock.results[0].value;
        const nextUserChannel = {
            on: vi.fn().mockReturnValue(202),
            push: vi.fn(),
            off: vi.fn(),
        };
        const nextCallChannel = createMockChannel();
        const nextSocket = { channel: vi.fn().mockReturnValue(nextCallChannel) } as any;

        callSignalingService.initialize(nextSocket, nextUserChannel as any, currentUserId);

        expect(firstCallChannel.leave).toHaveBeenCalled();
        expect(mockUserChannel.off).toHaveBeenCalledWith('incoming_call', expect.any(Number));
        expect(nextSocket.channel).toHaveBeenCalledWith(`call:${currentUserId}`, {});
        expect(nextCallChannel.on).toHaveBeenCalledWith('offer', expect.any(Function));
        expect(nextUserChannel.on).toHaveBeenCalledWith('incoming_call', expect.any(Function));
    });

    describe('startCall', () => {
        it('блокирует звонок себе', () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(currentUserId);
            });
            expect(result.current.status).toBe('idle');
            expect(MockWebRTCService).not.toHaveBeenCalled();
        });

        // УБРАЛИ async и waitFor
        it('игнорирует вызов если статус не idle', () => {
            const { result } = renderHook(() => useCall(currentUserId));

            act(() => result.current.startCall(2));
            expect(result.current.status).toBe('calling');

            act(() => result.current.startCall(3));
            expect(MockWebRTCService).toHaveBeenCalledTimes(1);
        });

        it('устанавливает статус calling, создаёт WebRTCService и вызывает startCall', async () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            expect(result.current.status).toBe('calling');
            expect(result.current.remoteUserId).toBe(2);
            expect(MockWebRTCService).toHaveBeenCalledWith(
                expect.anything(),
                currentUserId,
                2
            );
            const service = MockWebRTCService.mock.results[0]?.value;
            expect(service.startCall).toHaveBeenCalled();
        });

        it('does not tear down the outgoing call during local state updates', async () => {
            const { result } = renderHook(() => useCall(currentUserId));

            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;

            act(() => {
                service.onCallIdReceived?.('call-123');
                service.onRemoteStream?.({ id: 'remote-preview' });
            });

            await act(async () => {
                await Promise.resolve();
            });

            expect(result.current.status).toBe('calling');
            expect(result.current.callId).toBe('call-123');
            expect(result.current.remoteStream).toEqual({ id: 'remote-preview' });
            expect(service.dispose).not.toHaveBeenCalled();
            expect(callChannel.leave).not.toHaveBeenCalled();
            expect(mockUserChannel.off).not.toHaveBeenCalled();
        });

        it('does not disconnect signaling after startCall creates the offer flow', async () => {
            const disconnectSpy = vi.spyOn(callSignalingService, 'disconnect');
            const { result } = renderHook(() => useCall(currentUserId));

            disconnectSpy.mockClear();

            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;

            await act(async () => {
                await Promise.resolve();
            });

            expect(service.startCall).toHaveBeenCalled();
            expect(service.dispose).not.toHaveBeenCalled();
            expect(disconnectSpy).not.toHaveBeenCalled();
        });

        it('does not teardown when the current user call ref changes during an outgoing call', async () => {
            const disconnectSpy = vi.spyOn(callSignalingService, 'disconnect');
            const { result, rerender } = renderHook(() => useCall(currentUserId));

            disconnectSpy.mockClear();

            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;

            act(() => {
                service.onCallIdReceived?.('call-123');
                mockStoreState.currentUser = { id: 1, public_id: 'user-public-id' };
                rerender();
            });

            await act(async () => {
                await Promise.resolve();
            });

            expect(result.current.status).toBe('calling');
            expect(result.current.callId).toBe('call-123');
            expect(service.dispose).not.toHaveBeenCalled();
            expect(disconnectSpy).not.toHaveBeenCalled();
            expect(callChannel.leave).not.toHaveBeenCalled();
            expect(mockUserChannel.off).not.toHaveBeenCalled();
            expect(mockUserChannel.on).toHaveBeenCalledTimes(1);
            expect(mockSocketManager.socket.channel).toHaveBeenCalledTimes(1);
        });

        it('does not teardown on a normal rerender after startCall', async () => {
            const disconnectSpy = vi.spyOn(callSignalingService, 'disconnect');
            const { result, rerender } = renderHook(({ userId }) => useCall(userId), {
                initialProps: { userId: currentUserId },
            });

            disconnectSpy.mockClear();

            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;

            act(() => {
                rerender({ userId: currentUserId });
            });

            await act(async () => {
                await Promise.resolve();
            });

            expect(service.dispose).not.toHaveBeenCalled();
            expect(disconnectSpy).not.toHaveBeenCalled();
            expect(mockUserChannel.on).toHaveBeenCalledTimes(1);
            expect(mockSocketManager.socket.channel).toHaveBeenCalledTimes(1);
        });

        it('устанавливает таймаут 30 секунд и при его истечении завершает звонок', async () => {
            const { result } = renderHook(() => useCall(currentUserId));

            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            expect(service.startCall).toHaveBeenCalled();

            // ПРОТАЛКИВАЕМ МИКРОТАСКИ, чтобы .then() внутри startCall() установил setTimeout
            await act(async () => {
                await Promise.resolve();
            });

            act(() => {
                vi.advanceTimersByTime(30000);
            });

            expect(service.dispose).toHaveBeenCalled();
            expect(result.current.status).toBe('failed');
            expect(result.current.callIssue?.message).toBe('Call timed out. No answer.');

            await act(async () => {
                vi.advanceTimersByTime(2000);
                vi.runOnlyPendingTimers();
                await Promise.resolve();
            });
            expect(result.current.status).toBe('idle');
            expect(result.current.remoteUserId).toBeNull();
        });

        it('keeps the timeout armed while the outgoing call is unanswered', async () => {
            const { result } = renderHook(() => useCall(currentUserId));

            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;

            await act(async () => {
                await Promise.resolve();
            });

            act(() => {
                vi.advanceTimersByTime(29_999);
            });

            expect(result.current.status).toBe('calling');
            expect(service.dispose).not.toHaveBeenCalled();

            act(() => {
                vi.advanceTimersByTime(1);
            });

            expect(service.dispose).toHaveBeenCalled();
            expect(result.current.status).toBe('failed');
        });

        it('surfaces a microphone permission denied message when the call cannot start', async () => {
            MockWebRTCService.mockImplementationOnce(function (this: any) {
                this.startCall = vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
                this.dispose = vi.fn();
                this.setCallId = vi.fn();
                this.getSignalingCallId = vi.fn(() => 'fallback-call-id');
                this.toggleLocalMuted = vi.fn(() => false);
                this.getDiagnosticsSnapshot = vi.fn().mockReturnValue({
                    connectionState: 'unknown',
                    iceConnectionState: 'unknown',
                    iceGatheringState: 'unknown',
                    signalingState: 'unknown',
                    selectedCandidatePair: null,
                });
                return this;
            });

            const { result } = renderHook(() => useCall(currentUserId));

            act(() => {
                result.current.startCall(2);
            });

            await act(async () => {
                await Promise.resolve();
            });

            expect(result.current.status).toBe('failed');
            expect(result.current.callIssue?.message).toBe('Microphone permission denied.');
        });
    });

    describe('incoming_call', () => {
        it('устанавливает статус ringing и сохраняет данные', async () => {
            const { result } = renderHook(() => useCall(currentUserId));
            const incomingCallHandler = mockUserChannel.on.mock.calls.find(
                (c: any[]) => c[0] === 'incoming_call'
            )?.[1];
            if (incomingCallHandler) {
                act(() => {
                    incomingCallHandler({ from_user_id: 3, call_id: 'call-123' });
                });
            }
            expect(result.current.status).toBe('ringing');
            expect(result.current.remoteUserId).toBe(3);
            expect(result.current.callId).toBe('call-123');
        });

        it('clears stale call state after logout and re-login', () => {
            const { result, rerender } = renderHook(({ userId }) => useCall(userId), {
                initialProps: { userId: currentUserId },
            });
            const incomingCallHandler = mockUserChannel.on.mock.calls.find(
                (c: any[]) => c[0] === 'incoming_call'
            )?.[1];

            act(() => {
                incomingCallHandler({ from_user_id: 3, from_username: 'caller', call_id: 'call-123' });
            });

            expect(result.current.status).toBe('ringing');

            act(() => {
                rerender({ userId: 0 });
            });

            expect(result.current.status).toBe('idle');
            expect(result.current.remoteUserId).toBeNull();
            expect(result.current.callId).toBeNull();

            act(() => {
                rerender({ userId: 4 });
            });

            expect(result.current.status).toBe('idle');
            expect(result.current.remoteUserId).toBeNull();
        });
    });

    describe('offer', () => {
        it('сохраняет SDP для последующего acceptCall', async () => {
            const { result } = renderHook(() => useCall(currentUserId));
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const offerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'offer')?.[1];
            if (offerHandler) {
                act(() => {
                    offerHandler({ sdp: 'test-sdp', from_user_id: 2 });
                });
            }
            const incomingCallHandler = mockUserChannel.on.mock.calls.find(
                (c: any[]) => c[0] === 'incoming_call'
            )?.[1];
            if (incomingCallHandler) {
                act(() => {
                    incomingCallHandler({ from_user_id: 2, call_id: 'call-123' });
                });
            }
            act(() => {
                result.current.acceptCall();
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            expect(service.acceptCall).toHaveBeenCalledWith('test-sdp');
        });

        it('создаёт incoming call state из pending offer, полученного до монтирования хука', async () => {
            callSignalingService.initialize(mockSocketManager.socket, mockUserChannel, currentUserId);
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const offerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'offer')?.[1];

            act(() => {
                offerHandler({
                    sdp: 'early-offer-sdp',
                    from_user_id: 2,
                    from_username: 'caller',
                    call_id: 'call-early',
                });
            });

            const { result } = renderHook(() => useCall(currentUserId));

            expect(result.current.status).toBe('ringing');
            expect(result.current.remoteUserId).toBe(2);
            expect(result.current.remoteUsername).toBe('caller');
            expect(result.current.callId).toBe('call-early');

            act(() => {
                result.current.acceptCall();
                result.current.acceptCall();
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            expect(MockWebRTCService).toHaveBeenCalledTimes(1);
            expect(service.acceptCall).toHaveBeenCalledTimes(1);
            expect(service.acceptCall).toHaveBeenCalledWith('early-offer-sdp');
            expect(callSignalingService.consumePendingOffer()).toBeNull();
        });
    });

    describe('answer', () => {
        it('вызывает handleAnswer и переводит статус в active', async () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];
            if (answerHandler) {
                act(() => {
                    answerHandler({ sdp: 'answer-sdp' });
                });
            }
            expect(service.handleAnswer).toHaveBeenCalledWith('answer-sdp');
            expect(result.current.status).toBe('active');
        });

        it('clears the outgoing timeout when an answer is received', async () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];

            await act(async () => {
                await Promise.resolve();
            });

            act(() => {
                answerHandler({ sdp: 'answer-sdp', from_username: 'caller' });
            });

            act(() => {
                vi.advanceTimersByTime(30_000);
            });

            expect(service.handleAnswer).toHaveBeenCalledWith('answer-sdp');
            expect(service.dispose).not.toHaveBeenCalled();
            expect(result.current.status).toBe('active');
        });
    });

    describe('ice_candidate', () => {
        it('вызывает addIceCandidate у сервиса', async () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const iceHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'ice_candidate')?.[1];
            if (iceHandler) {
                act(() => {
                    iceHandler({ candidate: { candidate: 'c' } });
                });
            }
            expect(service.addIceCandidate).toHaveBeenCalledWith({ candidate: 'c' });
        });
    });

    describe('diagnostics polling', () => {
        it('updates diagnostics from unknown to relay during an active call', async () => {
            vi.stubEnv('DEV', true);
            vi.stubEnv('VITE_WEBRTC_SHOW_DIAGNOSTICS', 'true');

            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            service.collectDiagnostics.mockImplementation(async () => {
                service.onDiagnosticsChange?.({
                    connectionState: 'connected',
                    iceConnectionState: 'connected',
                    iceGatheringState: 'complete',
                    signalingState: 'stable',
                    selectedCandidatePair: {
                        candidatePairId: 'pair-1',
                        localCandidateId: 'local-1',
                        remoteCandidateId: 'remote-1',
                        localCandidateType: 'relay',
                        state: 'succeeded',
                        nominated: true,
                    },
                });
                return service.getDiagnosticsSnapshot();
            });

            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];
            act(() => {
                answerHandler({ sdp: 'answer-sdp', from_username: 'caller' });
            });

            expect(result.current.diagnostics.selectedLocalCandidateType).toBe('unknown');

            await act(async () => {
                vi.advanceTimersByTime(1500);
                await Promise.resolve();
            });

            expect(service.collectDiagnostics).toHaveBeenCalled();
            expect(result.current.diagnostics.selectedLocalCandidateType).toBe('relay');
        });

        it('stops diagnostics refresh after hangup and unmount', async () => {
            vi.stubEnv('DEV', true);
            vi.stubEnv('VITE_WEBRTC_SHOW_DIAGNOSTICS', 'true');

            const { result, unmount } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];
            act(() => {
                answerHandler({ sdp: 'answer-sdp', from_username: 'caller' });
            });

            await act(async () => {
                vi.advanceTimersByTime(1500);
                await Promise.resolve();
            });
            expect(service.collectDiagnostics).toHaveBeenCalledTimes(1);

            act(() => {
                result.current.hangUp();
            });

            await act(async () => {
                vi.advanceTimersByTime(3000);
                await Promise.resolve();
            });
            expect(service.collectDiagnostics).toHaveBeenCalledTimes(1);

            unmount();
            await act(async () => {
                vi.advanceTimersByTime(3000);
                await Promise.resolve();
            });
            expect(service.collectDiagnostics).toHaveBeenCalledTimes(1);
            expect(service.dispose).toHaveBeenCalled();
        });
    });

    describe('hang_up event', () => {
        it('завершает звонок и переводит в ended -> idle', async () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const hangUpHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'hang_up')?.[1];
            if (hangUpHandler) {
                act(() => {
                    hangUpHandler({ from_user_id: 2 });
                });
            }
            expect(service.dispose).toHaveBeenCalled();
            expect(result.current.status).toBe('ended');
            await act(async () => {
                vi.advanceTimersByTime(2000);
                vi.runOnlyPendingTimers();
                await Promise.resolve();
            });
            expect(result.current.status).toBe('idle');
            expect(result.current.remoteUserId).toBeNull();
        });
    });

    describe('acceptCall', () => {
        it('вызывает acceptCall у сервиса и меняет статус', async () => {
            const { result } = renderHook(() => useCall(currentUserId));
            const incomingHandler = mockUserChannel.on.mock.calls.find((c: any[]) => c[0] === 'incoming_call')?.[1];
            if (incomingHandler) {
                act(() => {
                    incomingHandler({ from_user_id: 2, call_id: 'call-123' });
                });
            }
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const offerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'offer')?.[1];
            if (offerHandler) {
                act(() => {
                    offerHandler({ sdp: 'test-sdp', from_user_id: 2 });
                });
            }
            act(() => {
                result.current.acceptCall();
            });
            expect(result.current.status).toBe('active');
            const service = MockWebRTCService.mock.results[0]?.value;
            expect(service.acceptCall).toHaveBeenCalledWith('test-sdp');
        });

        it('does not leave a stale outgoing timeout after acceptCall', async () => {
            const { result } = renderHook(() => useCall(currentUserId));
            const incomingHandler = mockUserChannel.on.mock.calls.find((c: any[]) => c[0] === 'incoming_call')?.[1];
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const offerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'offer')?.[1];

            act(() => {
                incomingHandler({ from_user_id: 2, call_id: 'call-123' });
                offerHandler({ sdp: 'test-sdp', from_user_id: 2 });
            });

            act(() => {
                result.current.acceptCall();
            });

            const service = MockWebRTCService.mock.results[0]?.value;

            act(() => {
                vi.advanceTimersByTime(30_000);
            });

            expect(service.acceptCall).toHaveBeenCalledWith('test-sdp');
            expect(service.dispose).not.toHaveBeenCalled();
            expect(result.current.status).toBe('active');
        });

        it('игнорирует если статус не ringing', () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.acceptCall();
            });
            expect(MockWebRTCService).not.toHaveBeenCalled();
        });
    });

    describe('rejectCall', () => {
        it('отправляет hang_up в канал и сбрасывает состояние', async () => {
            const { result } = renderHook(() => useCall(currentUserId));
            const incomingHandler = mockUserChannel.on.mock.calls.find((c: any[]) => c[0] === 'incoming_call')?.[1];
            if (incomingHandler) {
                act(() => {
                    incomingHandler({ from_user_id: 2, call_id: 'call-123' });
                });
            }
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            act(() => {
                result.current.rejectCall();
            });
            expect(callChannel.push).toHaveBeenCalledWith('hang_up', { call_id: 'call-123', to_user_id: 2 });
            expect(result.current.status).toBe('ended');
            await act(async () => {
                vi.advanceTimersByTime(2000);
                vi.runOnlyPendingTimers();
                await Promise.resolve();
            });
            expect(result.current.status).toBe('idle');
            expect(result.current.remoteUserId).toBeNull();
        });

        it('ignores duplicate decline clicks once a decision is in progress', () => {
            const { result } = renderHook(() => useCall(currentUserId));
            const incomingHandler = mockUserChannel.on.mock.calls.find((c: any[]) => c[0] === 'incoming_call')?.[1];
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;

            act(() => {
                incomingHandler({ from_user_id: 2, call_id: 'call-123' });
            });

            act(() => {
                result.current.rejectCall();
                result.current.rejectCall();
            });

            expect(callChannel.push).toHaveBeenCalledTimes(1);
            expect(callChannel.push).toHaveBeenCalledWith('hang_up', { call_id: 'call-123', to_user_id: 2 });
        });
    });

    describe('hangUp', () => {
        it('отправляет hang_up в канал и завершает звонок', async () => {
            const { result } = renderHook(() => useCall(currentUserId));

            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;

            // СИМУЛИРУЕМ получение callId от сервера, чтобы хук знал, какой звонок завершать
            act(() => {
                if (service.onCallIdReceived) {
                    service.onCallIdReceived('call-123');
                }
            });

            act(() => {
                result.current.hangUp();
            });

            expect(callChannel.push).toHaveBeenCalledWith('hang_up', { call_id: 'call-123', to_user_id: 2 });
            expect(service.dispose).toHaveBeenCalled();
            expect(result.current.status).toBe('ended');

            await act(async () => {
                vi.advanceTimersByTime(2000);
                vi.runOnlyPendingTimers();
                await Promise.resolve();
            });
            expect(result.current.status).toBe('idle');
        });

        it('is safe to call multiple times', () => {
            const { result } = renderHook(() => useCall(currentUserId));

            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            act(() => {
                if (service.onCallIdReceived) {
                    service.onCallIdReceived('call-123');
                }
            });

            expect(() => {
                act(() => {
                    result.current.hangUp();
                    result.current.hangUp();
                });
            }).not.toThrow();

            expect(result.current.status).toBe('ended');
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            expect(callChannel.push).toHaveBeenCalledTimes(1);
            expect(callChannel.push).toHaveBeenCalledWith('hang_up', { call_id: 'call-123', to_user_id: 2 });
            expect(service.dispose).toHaveBeenCalledTimes(2);
        });

        it('sends hang_up with the service call id while renegotiation is pending', () => {
            const { result } = renderHook(() => useCall(currentUserId));

            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            act(() => {
                service.setCallId('call-123');
                result.current.hangUp();
            });

            expect(service.getSignalingCallId).toHaveBeenCalled();
            expect(callChannel.push).toHaveBeenCalledWith('hang_up', { call_id: 'call-123', to_user_id: 2 });
            expect(service.dispose).toHaveBeenCalled();
            expect(result.current.status).toBe('ended');
        });

        it('sends hang_up from a stale callback using current call refs', () => {
            const { result } = renderHook(() => useCall(currentUserId));
            const staleHangUp = result.current.hangUp;

            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;

            act(() => {
                service.onCallIdReceived?.('call-123');
                staleHangUp();
            });

            expect(callChannel.push).toHaveBeenCalledWith('hang_up', { call_id: 'call-123', to_user_id: 2 });
            expect(service.dispose).toHaveBeenCalled();
            expect(result.current.status).toBe('ended');
        });
    });

    describe('toggleMute', () => {
        it('переключает isMuted через публичный API сервиса', async () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;

            act(() => {
                result.current.toggleMute();
            });
            expect(service.toggleLocalMuted).toHaveBeenCalledTimes(1);
            expect(result.current.isMuted).toBe(true);

            act(() => {
                result.current.toggleMute();
            });
            expect(service.toggleLocalMuted).toHaveBeenCalledTimes(2);
            expect(result.current.isMuted).toBe(false);
        });
    });

    describe('screen sharing', () => {
        it('startScreenShare calls getDisplayMedia and sets state', async () => {
            const endedListeners: Array<() => void> = [];
            const track = {
                stop: vi.fn(),
                addEventListener: vi.fn((event: string, handler: () => void) => {
                    if (event === 'ended') endedListeners.push(handler);
                }),
                removeEventListener: vi.fn(),
                onended: null as (() => void) | null,
            };
            const stream = {
                getVideoTracks: vi.fn(() => [track]),
                getTracks: vi.fn(() => [track]),
            };
            mockGetDisplayMedia.mockResolvedValue(stream);

            const { result } = renderHook(() => useCall(currentUserId));

            await act(async () => {
                await result.current.startScreenShare();
            });

            expect(mockGetDisplayMedia).toHaveBeenCalledWith({
                video: true,
                audio: false,
            });
            expect(result.current.isScreenSharing).toBe(true);
            expect(result.current.localScreenStream).toBe(stream);
            expect(track.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
        });

        it('stopScreenShare stops tracks and clears state', async () => {
            const track = {
                stop: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                onended: null as (() => void) | null,
            };
            const stream = {
                getVideoTracks: vi.fn(() => [track]),
                getTracks: vi.fn(() => [track]),
            };
            mockGetDisplayMedia.mockResolvedValue(stream);

            const { result } = renderHook(() => useCall(currentUserId));

            await act(async () => {
                await result.current.startScreenShare();
            });

            act(() => {
                result.current.stopScreenShare();
            });

            expect(track.stop).toHaveBeenCalled();
            expect(result.current.isScreenSharing).toBe(false);
            expect(result.current.localScreenStream).toBeNull();
        });

        it('active call stays active when stopScreenShare is used', async () => {
            const track = {
                stop: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                onended: null as (() => void) | null,
            };
            const stream = {
                getVideoTracks: vi.fn(() => [track]),
                getTracks: vi.fn(() => [track]),
            };
            mockGetDisplayMedia.mockResolvedValue(stream);

            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];

            act(() => {
                answerHandler({ sdp: 'answer-sdp', from_username: 'caller' });
            });

            await act(async () => {
                await result.current.startScreenShare();
            });

            act(() => {
                result.current.stopScreenShare();
            });

            expect(result.current.status).toBe('active');
            expect(result.current.isScreenSharing).toBe(false);
            expect(result.current.localScreenStream).toBeNull();
            expect(callChannel.push).not.toHaveBeenCalled();
            expect(service.dispose).not.toHaveBeenCalled();
        });

        it('track ended event clears state', async () => {
            let endedHandler: (() => void) | null = null;
            const track = {
                stop: vi.fn(),
                addEventListener: vi.fn((event: string, handler: () => void) => {
                    if (event === 'ended') endedHandler = handler;
                }),
                removeEventListener: vi.fn(),
                onended: null as (() => void) | null,
            };
            const stream = {
                getVideoTracks: vi.fn(() => [track]),
                getTracks: vi.fn(() => [track]),
            };
            mockGetDisplayMedia.mockResolvedValue(stream);

            const { result } = renderHook(() => useCall(currentUserId));

            await act(async () => {
                await result.current.startScreenShare();
            });

            expect(result.current.isScreenSharing).toBe(true);

            act(() => {
                endedHandler?.();
            });

            expect(result.current.isScreenSharing).toBe(false);
            expect(result.current.localScreenStream).toBeNull();
        });

        it('track ended event keeps the call active and does not signal hangup', async () => {
            let endedHandler: (() => void) | null = null;
            const track = {
                stop: vi.fn(),
                addEventListener: vi.fn((event: string, handler: () => void) => {
                    if (event === 'ended') endedHandler = handler;
                }),
                removeEventListener: vi.fn(),
                onended: null as (() => void) | null,
            };
            const stream = {
                getVideoTracks: vi.fn(() => [track]),
                getTracks: vi.fn(() => [track]),
            };
            mockGetDisplayMedia.mockResolvedValue(stream);

            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];

            act(() => {
                answerHandler({ sdp: 'answer-sdp', from_username: 'caller' });
            });

            await act(async () => {
                await result.current.startScreenShare();
            });

            act(() => {
                endedHandler?.();
            });

            expect(result.current.status).toBe('active');
            expect(result.current.isScreenSharing).toBe(false);
            expect(result.current.localScreenStream).toBeNull();
            expect(callChannel.push).not.toHaveBeenCalled();
            expect(service.dispose).not.toHaveBeenCalled();
            expect(track.stop).not.toHaveBeenCalled();
        });

        it('teardown and hangUp stop screen capture tracks', async () => {
            const track = {
                stop: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                onended: null as (() => void) | null,
            };
            const stream = {
                getVideoTracks: vi.fn(() => [track]),
                getTracks: vi.fn(() => [track]),
            };
            mockGetDisplayMedia.mockResolvedValue(stream);

            const { result, unmount } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;

            await act(async () => {
                await result.current.startScreenShare();
            });

            act(() => {
                if (service.onCallIdReceived) {
                    service.onCallIdReceived('call-123');
                }
                result.current.hangUp();
            });

            expect(track.stop).toHaveBeenCalled();
            expect(result.current.localScreenStream).toBeNull();

            await act(async () => {
                await result.current.startScreenShare();
            });
            unmount();
            expect(track.stop).toHaveBeenCalledTimes(2);
        });

        it('repeated start and stop screen sharing does not leave stuck state', async () => {
            const firstTrack = {
                stop: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                onended: null as (() => void) | null,
            };
            const secondTrack = {
                stop: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                onended: null as (() => void) | null,
            };
            const firstStream = {
                getVideoTracks: vi.fn(() => [firstTrack]),
                getTracks: vi.fn(() => [firstTrack]),
            };
            const secondStream = {
                getVideoTracks: vi.fn(() => [secondTrack]),
                getTracks: vi.fn(() => [secondTrack]),
            };
            mockGetDisplayMedia
                .mockResolvedValueOnce(firstStream)
                .mockResolvedValueOnce(secondStream);

            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];

            act(() => {
                answerHandler({ sdp: 'answer-sdp', from_username: 'caller' });
            });

            await act(async () => {
                await result.current.startScreenShare();
            });
            act(() => {
                result.current.stopScreenShare();
            });
            expect(result.current.status).toBe('active');
            expect(result.current.isScreenSharing).toBe(false);

            await act(async () => {
                await result.current.startScreenShare();
            });
            expect(result.current.status).toBe('active');
            expect(result.current.isScreenSharing).toBe(true);
            expect(result.current.localScreenStream).toBe(secondStream);

            act(() => {
                result.current.stopScreenShare();
            });
            expect(result.current.status).toBe('active');
            expect(result.current.isScreenSharing).toBe(false);
            expect(result.current.localScreenStream).toBeNull();
            expect(firstTrack.stop).toHaveBeenCalled();
            expect(secondTrack.stop).toHaveBeenCalled();
        });

        it('unsupported getDisplayMedia fails gracefully', async () => {
            Object.defineProperty(global.navigator, 'mediaDevices', {
                value: {},
                writable: true,
            });
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            const { result } = renderHook(() => useCall(currentUserId));

            await act(async () => {
                await result.current.startScreenShare();
            });

            expect(result.current.isScreenSharing).toBe(false);
            expect(result.current.localScreenStream).toBeNull();
            expect(result.current.callIssue?.message).toBe('Screen sharing is not supported in this browser.');
            expect(warnSpy).toHaveBeenCalledWith('[useCall] Screen sharing is not supported in this environment');

            warnSpy.mockRestore();
        });

        it('screen-share permission denial is surfaced to the user', async () => {
            const error = new DOMException('Permission denied', 'NotAllowedError');
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            mockGetDisplayMedia.mockRejectedValue(error);

            const { result } = renderHook(() => useCall(currentUserId));

            await act(async () => {
                await result.current.startScreenShare();
            });

            expect(result.current.isScreenSharing).toBe(false);
            expect(result.current.localScreenStream).toBeNull();
            expect(result.current.callIssue?.message).toBe('Screen share permission denied.');
            expect(warnSpy).toHaveBeenCalledWith('[useCall] Screen share was not started', error);

            warnSpy.mockRestore();
        });

        it('startScreenShare in an active call uses WebRTC and keeps status active', async () => {
            const track = {
                stop: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                onended: null as (() => void) | null,
            };
            const stream = {
                getVideoTracks: vi.fn(() => [track]),
                getTracks: vi.fn(() => [track]),
            };
            mockGetDisplayMedia.mockResolvedValue(stream);

            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];

            act(() => {
                answerHandler({ sdp: 'answer-sdp', from_username: 'caller' });
            });

            await act(async () => {
                await result.current.startScreenShare();
            });

            expect(service.startScreenShare).toHaveBeenCalledWith(expect.any(Function));
            expect(result.current.status).toBe('active');
            expect(result.current.isScreenSharing).toBe(true);
            expect(result.current.localScreenStream).toBe(stream);
        });

        it('remote screen stream state is set and cleared from WebRTC callbacks', () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];
            const remoteScreenStream = { id: 'remote-screen' };

            act(() => {
                answerHandler({ sdp: 'answer-sdp', from_username: 'caller' });
                service.onRemoteScreenStream?.(remoteScreenStream);
            });

            expect(result.current.status).toBe('active');
            expect(result.current.remoteScreenStream).toEqual(remoteScreenStream);

            act(() => {
                service.onRemoteScreenStream?.(null);
            });

            expect(result.current.remoteScreenStream).toBeNull();

            act(() => {
                service.onRemoteScreenStream?.({ id: 'remote-screen-second' });
            });

            expect(result.current.remoteScreenStream).toEqual({ id: 'remote-screen-second' });
        });

        it('active-call offer is handled as renegotiation without leaving active status', () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];
            const offerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'offer')?.[1];

            act(() => {
                answerHandler({ sdp: 'answer-sdp', from_username: 'caller' });
            });
            act(() => {
                offerHandler({
                    sdp: 'renegotiation-offer-sdp',
                    from_user_id: 2,
                    from_username: 'caller',
                    call_id: 'call-123',
                });
            });

            expect(result.current.status).toBe('active');
            expect(service.setCallId).toHaveBeenCalledWith('call-123');
            expect(service.handleOffer).toHaveBeenCalledWith('renegotiation-offer-sdp');
            expect(service.dispose).not.toHaveBeenCalled();
        });

        it('active-call answer is applied to the existing peer during renegotiation', () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];

            act(() => {
                answerHandler({ sdp: 'initial-answer-sdp', from_username: 'caller', call_id: 'call-123' });
            });
            service.handleAnswer.mockClear();

            act(() => {
                answerHandler({ sdp: 'renegotiation-answer-sdp', from_username: 'caller', call_id: 'call-123' });
            });

            expect(result.current.status).toBe('active');
            expect(service.setCallId).toHaveBeenCalledWith('call-123');
            expect(service.handleAnswer).toHaveBeenCalledWith('renegotiation-answer-sdp');
            expect(MockWebRTCService).toHaveBeenCalledTimes(1);
        });

        it('active-call renegotiation signal received over the renegotiate event stays in the active call', () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];
            const renegotiationHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'renegotiate')?.[1];

            act(() => {
                answerHandler({ sdp: 'initial-answer-sdp', from_username: 'caller', call_id: 'call-123' });
            });

            act(() => {
                renegotiationHandler({
                    from_user_id: 2,
                    call_id: 'call-123',
                    sdp: 'renegotiation-offer-sdp',
                    type: 'offer',
                    screen_share_active: true,
                });
            });

            expect(result.current.status).toBe('active');
            expect(result.current.remoteUserId).toBe(2);
            expect(service.handleRenegotiation).toHaveBeenCalledWith({
                from_user_id: 2,
                call_id: 'call-123',
                sdp: 'renegotiation-offer-sdp',
                type: 'offer',
                screen_share_active: true,
            });
            expect(MockWebRTCService).toHaveBeenCalledTimes(1);
        });

        it('renegotiate answer is applied for an outgoing call started with a public user ref', () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall('user-public-id-2');
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];
            const renegotiationHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'renegotiate')?.[1];

            act(() => {
                answerHandler({
                    from_user_id: 2,
                    from_username: 'caller',
                    sdp: 'initial-answer-sdp',
                    call_id: 'call-123',
                });
            });
            service.handleRenegotiation.mockClear();

            act(() => {
                renegotiationHandler({
                    from_user_id: 2,
                    call_id: 'call-123',
                    sdp: 'renegotiation-answer-sdp',
                    type: 'answer',
                    screen_share_active: null,
                });
            });

            expect(result.current.remoteUserId).toBe(2);
            expect(service.handleRenegotiation).toHaveBeenCalledWith({
                from_user_id: 2,
                call_id: 'call-123',
                sdp: 'renegotiation-answer-sdp',
                type: 'answer',
                screen_share_active: null,
            });
        });

        it('initial answer for an outgoing call started with a public user ref stores the real call id', () => {
            const { result } = renderHook(() => useCall(currentUserId));

            act(() => {
                result.current.startCall('user-public-id-2');
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];

            act(() => {
                answerHandler({
                    from_user_id: 2,
                    from_username: 'callee',
                    sdp: 'initial-answer-sdp',
                    call_id: 'call-123',
                });
            });

            expect(result.current.status).toBe('active');
            expect(result.current.remoteUserId).toBe(2);
            expect(result.current.callId).toBe('call-123');
            expect(service.setCallId).toHaveBeenCalledWith('call-123');
            expect(service.handleAnswer).toHaveBeenCalledWith('initial-answer-sdp');
        });

        it('remote hang_up closes the call even during renegotiation', async () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];
            const offerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'offer')?.[1];
            const hangUpHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'hang_up')?.[1];

            act(() => {
                answerHandler({ sdp: 'answer-sdp', from_username: 'caller', call_id: 'call-123' });
                offerHandler({
                    sdp: 'renegotiation-offer-sdp',
                    from_user_id: 2,
                    from_username: 'caller',
                    call_id: 'call-123',
                });
                service.onRemoteScreenStream?.({ id: 'remote-screen' });
                hangUpHandler({ from_user_id: 2, call_id: 'call-123' });
            });

            expect(service.handleOffer).toHaveBeenCalledWith('renegotiation-offer-sdp');
            expect(service.dispose).toHaveBeenCalled();
            expect(result.current.remoteScreenStream).toBeNull();
            expect(result.current.status).toBe('ended');

            await act(async () => {
                vi.advanceTimersByTime(2000);
                vi.runOnlyPendingTimers();
                await Promise.resolve();
            });
            expect(result.current.status).toBe('idle');
        });
    });

    describe('local teardown', () => {
        it('disposes the service on unmount during an active call', () => {
            const { result, unmount } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];

            act(() => {
                answerHandler({ sdp: 'answer-sdp', from_username: 'caller' });
                service.onRemoteStream?.({ id: 'remote-stream' });
            });

            expect(result.current.status).toBe('active');
            expect(result.current.remoteStream).toEqual({ id: 'remote-stream' });

            unmount();

            expect(service.dispose).toHaveBeenCalled();
            expect(callChannel.leave).toHaveBeenCalled();
            expect(mockUserChannel.off).toHaveBeenCalledWith('incoming_call', 101);
        });

        it('clears local state when the socket manager becomes unavailable', () => {
            const { result, rerender } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];

            act(() => {
                answerHandler({ sdp: 'answer-sdp', from_username: 'caller' });
                service.onRemoteStream?.({ id: 'remote-stream' });
            });

            expect(result.current.status).toBe('active');
            expect(result.current.remoteStream).toEqual({ id: 'remote-stream' });

            act(() => {
                mockStoreState.socketManager = null;
                rerender();
            });

            expect(service.dispose).toHaveBeenCalled();
            expect(callChannel.leave).toHaveBeenCalled();
            expect(mockUserChannel.off).toHaveBeenCalledWith('incoming_call', 101);
            expect(result.current.status).toBe('idle');
            expect(result.current.remoteUserId).toBeNull();
            expect(result.current.remoteStream).toBeNull();
            expect(result.current.callId).toBeNull();
        });

        it('clears local state when the authenticated user logs out', () => {
            const { result, rerender } = renderHook(({ userId }) => useCall(userId), {
                initialProps: { userId: currentUserId },
            });
            act(() => {
                result.current.startCall(2);
            });

            const service = MockWebRTCService.mock.results[0]?.value;
            const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
            const answerHandler = callChannel.on.mock.calls.find((c: any[]) => c[0] === 'answer')?.[1];

            act(() => {
                answerHandler({ sdp: 'answer-sdp', from_username: 'caller' });
                service.onRemoteStream?.({ id: 'remote-stream' });
            });

            act(() => {
                rerender({ userId: 0 });
            });

            expect(service.dispose).toHaveBeenCalled();
            expect(callChannel.leave).toHaveBeenCalled();
            expect(mockUserChannel.off).toHaveBeenCalledWith('incoming_call', 101);
            expect(result.current.status).toBe('idle');
            expect(result.current.remoteUserId).toBeNull();
            expect(result.current.remoteStream).toBeNull();
            expect(result.current.callId).toBeNull();
        });
    });
});
