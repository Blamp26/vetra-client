import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callSignalingService } from './callSignalingService';

type ReceiveStatus = 'ok' | 'error' | 'timeout';
type ReceiveCallbacks = Partial<Record<ReceiveStatus, (payload?: unknown) => void>>;

function createChannelMock() {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();
  const receiveCallbacks: ReceiveCallbacks = {};
  const closeHandlers: Array<() => void> = [];
  const errorHandlers: Array<() => void> = [];

  const joinPush = {
    receive(status: ReceiveStatus, callback: (payload?: unknown) => void) {
      receiveCallbacks[status] = callback;
      return joinPush;
    },
  };

  return {
    handlers,
    receiveCallbacks,
    triggerClose: () => closeHandlers.forEach((handler) => handler()),
    triggerError: () => errorHandlers.forEach((handler) => handler()),
    channel: {
      on: vi.fn((event: string, handler: (payload: unknown) => void) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return handlers.get(event)?.length ?? 1;
      }),
      onClose: vi.fn((handler: () => void) => {
        closeHandlers.push(handler);
      }),
      onError: vi.fn((handler: () => void) => {
        errorHandlers.push(handler);
      }),
      join: vi.fn(() => joinPush),
      leave: vi.fn(),
    },
  };
}

function createSocketMock(channels: Array<ReturnType<typeof createChannelMock>>) {
  return {
    channel: vi.fn(() => {
      const next = channels.shift();
      if (!next) throw new Error('No channel mock available');
      return next.channel;
    }),
  };
}

function createUserChannelMock() {
  return {
    on: vi.fn(() => 1),
    off: vi.fn(),
  };
}

describe('callSignalingService readiness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    callSignalingService.disconnect();
  });

  afterEach(() => {
    callSignalingService.disconnect();
    vi.useRealTimers();
  });

  it('joins automatically and transitions to ready on join success', () => {
    const callChannel = createChannelMock();
    const socket = createSocketMock([callChannel]);
    const userChannel = createUserChannelMock();
    const readinessChanges: string[] = [];
    const unsubscribe = callSignalingService.onReadinessChange((status) => {
      readinessChanges.push(status);
    });

    callSignalingService.initialize(socket as never, userChannel as never, 1);

    expect(socket.channel).toHaveBeenCalledWith('call:1', {});
    expect(callSignalingService.getReadinessStatus()).toBe('connecting');

    callChannel.receiveCallbacks.ok?.();

    expect(callSignalingService.getReadinessStatus()).toBe('ready');
    expect(callSignalingService.isReady()).toBe(true);
    expect(readinessChanges).toEqual(['connecting', 'ready']);
    unsubscribe();
  });

  it('transitions to retrying and schedules a fresh join after timeout', () => {
    const firstChannel = createChannelMock();
    const secondChannel = createChannelMock();
    const socket = createSocketMock([firstChannel, secondChannel]);
    const userChannel = createUserChannelMock();

    callSignalingService.initialize(socket as never, userChannel as never, 1);
    firstChannel.receiveCallbacks.timeout?.();

    expect(callSignalingService.getReadinessStatus()).toBe('retrying');

    vi.advanceTimersByTime(500);

    expect(socket.channel).toHaveBeenCalledTimes(2);
    expect(firstChannel.channel.leave).toHaveBeenCalled();
    expect(callSignalingService.getReadinessStatus()).toBe('retrying');

    secondChannel.receiveCallbacks.ok?.();

    expect(callSignalingService.getReadinessStatus()).toBe('ready');
    expect(callSignalingService.isReady()).toBe(true);
  });

  it('does not create duplicate active channels for the same socket and user', () => {
    const callChannel = createChannelMock();
    const socket = createSocketMock([callChannel]);
    const userChannel = createUserChannelMock();

    callSignalingService.initialize(socket as never, userChannel as never, 1);
    callSignalingService.initialize(socket as never, userChannel as never, 1);

    expect(socket.channel).toHaveBeenCalledTimes(1);
    expect(userChannel.on).toHaveBeenCalledTimes(1);
  });
});
