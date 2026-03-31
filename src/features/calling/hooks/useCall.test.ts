import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCall } from './useCall';
import { useAppStore } from "@/store";

// ----------------------------------------------------------------------
// Моки модулей
// ----------------------------------------------------------------------
vi.mock('@/store', () => ({
    useAppStore: vi.fn(),
}));

vi.mock('../services/webrtcService', () => {
    const MockWebRTCService = vi.fn().mockImplementation(function (this: any, _channel: any, _localUserId: number, _remoteUserId: number) {
        this.startCall = vi.fn().mockResolvedValue(undefined);
        this.acceptCall = vi.fn().mockResolvedValue(undefined);
        this.handleAnswer = vi.fn().mockResolvedValue(undefined);
        this.addIceCandidate = vi.fn();
        this.hangUp = vi.fn();
        this.onRemoteStream = null;
        this.onCallIdReceived = null;
        this.localStream = null;
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
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    MockWebRTCService.mockClear();

    mockUserChannel = {
        on: vi.fn(),
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

    (vi.mocked(useAppStore) as any).mockImplementation((selector: any) =>
        selector({ currentUser: { id: 1 }, socketManager: mockSocketManager })
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
        expect(callChannel.leave).toHaveBeenCalled();
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

            expect(service.hangUp).toHaveBeenCalled();
            expect(result.current.status).toBe('ended');

            act(() => {
                vi.advanceTimersByTime(2000);
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
            expect(service.hangUp).toHaveBeenCalled();
            expect(result.current.status).toBe('ended');
            act(() => {
                vi.advanceTimersByTime(2000);
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
            act(() => {
                vi.advanceTimersByTime(2000);
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
            expect(service.hangUp).toHaveBeenCalled();
            expect(result.current.status).toBe('ended');

            act(() => {
                vi.advanceTimersByTime(2000);
            });
            expect(result.current.status).toBe('idle');
        });
    });

    describe('toggleMute', () => {
        it('переключает isMuted и отключает/включает аудиотрек', async () => {
            const { result } = renderHook(() => useCall(currentUserId));
            act(() => {
                result.current.startCall(2);
            });
            const service = MockWebRTCService.mock.results[0]?.value;
            const localStream = {
                getAudioTracks: vi.fn().mockReturnValue([{ enabled: true }]),
            };
            service.localStream = localStream;

            act(() => {
                result.current.toggleMute();
            });
            expect(localStream.getAudioTracks()[0].enabled).toBe(false);
            expect(result.current.isMuted).toBe(true);

            act(() => {
                result.current.toggleMute();
            });
            expect(localStream.getAudioTracks()[0].enabled).toBe(true);
            expect(result.current.isMuted).toBe(false);
        });
    });
});