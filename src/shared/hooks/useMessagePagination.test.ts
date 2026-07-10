import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Message } from "@/shared/types";
import {
  type MessagePaginationActions,
  type MessagePaginationState,
  useMessagePagination,
} from "./useMessagePagination";

function makeActions(): MessagePaginationActions {
  return {
    init: vi.fn(),
    setLoading: vi.fn(),
    setMessages: vi.fn(),
    setHasMore: vi.fn(),
    prepend: vi.fn(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function message(id: number): Message {
  return { id, content: `message ${id}` } as Message;
}

describe("useMessagePagination", () => {
  it("does not reload when the same conversation key rerenders", async () => {
    const fetchPage = vi.fn().mockResolvedValue([]);
    const actions = makeActions();

    const { rerender } = renderHook(
      ({ keyValue }) =>
        useMessagePagination(
          7,
          1,
          { messages: [], isLoading: false, hasMore: true },
          fetchPage,
          actions,
          keyValue,
        ),
      {
        initialProps: { keyValue: "room:7" },
      },
    );

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(actions.setLoading).toHaveBeenCalledTimes(2));

    rerender({ keyValue: "room:7" });

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(actions.setLoading).toHaveBeenCalledTimes(2);
  });

  it("treats direct and room conversations with the same numeric id as distinct loads", async () => {
    const fetchPage = vi.fn().mockResolvedValue([]);
    const actions = makeActions();

    const { rerender } = renderHook(
      ({ keyValue }) =>
        useMessagePagination(
          7,
          1,
          { messages: [], isLoading: false, hasMore: true },
          fetchPage,
          actions,
          keyValue,
        ),
      {
        initialProps: { keyValue: "direct:7" },
      },
    );

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));

    rerender({ keyValue: "room:7" });

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
  });

  it("ignores a stale initial response after switching conversations", async () => {
    const first = deferred<Message[]>();
    const second = deferred<Message[]>();
    const fetchPage = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const actionsA = makeActions();
    const actionsB = makeActions();

    const { rerender } = renderHook(
      ({ id, keyValue, actions }) =>
        useMessagePagination(
          id,
          1,
          { messages: [], isLoading: false, hasMore: true },
          fetchPage,
          actions,
          keyValue,
        ),
      { initialProps: { id: 7, keyValue: "direct:7", actions: actionsA } },
    );

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));
    rerender({ id: 8, keyValue: "direct:8", actions: actionsB });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));

    await act(async () => {
      second.resolve([message(8)]);
      await second.promise;
    });
    await act(async () => {
      first.resolve([message(7)]);
      await first.promise;
    });

    expect(actionsB.setMessages).toHaveBeenCalledWith([message(8)]);
    expect(actionsA.setMessages).not.toHaveBeenCalled();
  });

  it("clears the aborted conversation loading state and can reload it", async () => {
    const first = deferred<Message[]>();
    const second = deferred<Message[]>();
    const third = deferred<Message[]>();
    const fetchPage = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const actionsA = makeActions();
    const actionsB = makeActions();

    const { rerender } = renderHook(
      ({ id, keyValue, actions }) =>
        useMessagePagination(
          id,
          1,
          { messages: [], isLoading: false, hasMore: true },
          fetchPage,
          actions,
          keyValue,
        ),
      { initialProps: { id: 7, keyValue: "direct:7", actions: actionsA } },
    );

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));
    rerender({ id: 8, keyValue: "direct:8", actions: actionsB });
    await waitFor(() => expect(actionsA.setLoading).toHaveBeenLastCalledWith(false));
    expect(fetchPage.mock.calls[0][2]?.aborted).toBe(true);

    rerender({ id: 7, keyValue: "direct:7", actions: actionsA });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(3));

    await act(async () => {
      third.resolve([message(7)]);
      await third.promise;
    });

    expect(actionsA.setMessages).toHaveBeenCalledWith([message(7)]);
  });

  it("does not restart an initial load when only conversation state changes", async () => {
    const fetchPage = vi.fn().mockResolvedValue([message(7)]);
    const actions = makeActions();
    const initialState: MessagePaginationState = {
      messages: [],
      isLoading: false,
      hasMore: true,
    };

    const { rerender } = renderHook(
      ({ state }: { state: MessagePaginationState }) =>
        useMessagePagination(7, 1, state, fetchPage, actions, "direct:7"),
      { initialProps: { state: initialState } },
    );

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));
    rerender({ state: { messages: [message(7)], isLoading: false, hasMore: true } });

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(actions.init).toHaveBeenCalledTimes(1);
  });

  it("allows only one older-message request at a time", async () => {
    const initialMessages = Array.from({ length: 50 }, (_, index) => message(100 - index));
    const older = deferred<Message[]>();
    const fetchPage = vi.fn()
      .mockResolvedValueOnce(initialMessages)
      .mockReturnValueOnce(older.promise);
    const actions = makeActions();
    const initialState: MessagePaginationState = {
      messages: [],
      isLoading: false,
      hasMore: true,
    };

    const { result, rerender } = renderHook(
      ({ state }: { state: MessagePaginationState }) =>
        useMessagePagination(7, 1, state, fetchPage, actions, "direct:7"),
      { initialProps: { state: initialState } },
    );

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));
    rerender({ state: { messages: initialMessages, isLoading: false, hasMore: true } });

    act(() => {
      void result.current.loadMore();
      void result.current.loadMore();
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenLastCalledWith(50, 100, expect.any(AbortSignal));

    await act(async () => {
      older.resolve([message(50)]);
      await older.promise;
    });

    expect(actions.prepend).toHaveBeenCalledTimes(1);
  });
});
