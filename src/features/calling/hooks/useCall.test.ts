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
        this.startCall = vi.fn().mockResolvedValue(undefined);
        this.acceptCall = vi.fn().mockResolvedValue(undefined);
        this.handleAnswer = vi.fn().mockResolvedValue(undefined);
        this.collectDiagnostics = vi.fn().mockResolvedValue({
            connectionState: 'unknown',
            iceConnectionState: 'unknown',
            iceGatheringState: 'unknown',
            signalingState: 'unknown',
            selectedCandidatePair: null,
        });
        this.addIceCandidate = vi.fn();
        this.hangUp = vi.fn();
        this.dispose = vi.fn();
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
    });

    // УБРАЛИ async и waitFor
    it('при монтировании присоединяется к call каналу и подписывается на события', () => {
        const { unmount } = renderHook(() => useCall(currentUserId));

        expect(mockSocketManager.socket.channel).toHaveBeenCalledWith(`call:${currentUserId}`, {});
        expect(mockUserChannel.on).toHaveBeenCalledWith('incoming_call', expect.any(Function));

        const callChannel = mockSocketManager.socket.channel.mock.results[0].value;
        expect(callChannel.on).toHaveBeenCalledWith('answer', expect.any(Function));
        expect(callChannel.on).toHaveBeenCalledWith('ice_candidate', expect.any(Function));
        expect(callChannel.on).toHaveBeenCalledWith('hang_up', expect.any(Function));
        expect(callChannel.on).toHaveBeenCalledWith('offer', expect.any(Function));

        unmount();
        expect(callChannel.leave).not.toHaveBeenCalled();
    });

    it('does not duplicate signaling listeners for the same socket initialization', () => {
        callSignalingService.initialize(mockSocketManager.socket, mockUserChannel, currentUserId);

        const firstCallChannel = mockSocketManager.socket.channel.mock.results[0].value;
        expect(firstCallChannel.on).toHaveBeenCalledTimes(4);
        expect(mockUserChannel.on).toHaveBeenCalledTimes(1);

        callSignalingService.initialize(mockSocketManager.socket, mockUserChannel, currentUserId);

        expect(mockSocketManager.socket.channel).toHaveBeenCalledTimes(1);
        expect(firstCallChannel.on).toHaveBeenCalledTimes(4);
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
                    hangUpHandler({});
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
            expect(service.dispose).toHaveBeenCalledTimes(2);
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
            expect(result.current.status).toBe('idle');
            expect(result.current.remoteUserId).toBeNull();
            expect(result.current.remoteStream).toBeNull();
            expect(result.current.callId).toBeNull();
        });
    });
});
