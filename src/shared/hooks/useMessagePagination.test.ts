import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMessagePagination } from "./useMessagePagination";

describe("useMessagePagination", () => {
  it("does not reload when the same conversation key rerenders", async () => {
    const fetchPage = vi.fn().mockResolvedValue([]);
    const actions = {
      init: vi.fn(),
      setLoading: vi.fn(),
      setMessages: vi.fn(),
      setHasMore: vi.fn(),
      prepend: vi.fn(),
    };

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
    const actions = {
      init: vi.fn(),
      setLoading: vi.fn(),
      setMessages: vi.fn(),
      setHasMore: vi.fn(),
      prepend: vi.fn(),
    };

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
});
