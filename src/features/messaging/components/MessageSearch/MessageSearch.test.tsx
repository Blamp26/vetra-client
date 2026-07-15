import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/shared/types";

const { useAppStoreMock, searchMock, withFallbackRefMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  searchMock: vi.fn(),
  withFallbackRefMock: vi.fn((id: number, _fallback?: unknown, candidate?: { id?: number; public_id?: string }) => candidate?.public_id ?? id),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));
vi.mock("@/api/messages", () => ({ messagesApi: { search: searchMock } }));
vi.mock("@/api/rooms", () => ({ roomsApi: { search: searchMock } }));
vi.mock("@/shared/components/Avatar", () => ({ Avatar: ({ name }: { name: string }) => <span>{name}</span> }));
vi.mock("../../utils/attachments", () => ({ getPreviewText: () => "Preview" }));
vi.mock("@/shared/utils/refs", () => ({ withFallbackRef: withFallbackRefMock }));

import { MessageSearch } from "./MessageSearch";

describe("MessageSearch dialog", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({
      currentUser: { id: 1 },
      conversationPreviews: {},
      roomPreviews: {},
    }));
  });

  it("uses the direct dialog title, named input, initial focus, and close control", () => {
    const onClose = vi.fn();
    render(<MessageSearch targetId={3} type="direct" onClose={onClose} onJumpTo={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Search messages" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search messages" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Close message search" })).toBeInTheDocument();
    expect(screen.queryByText("Search", { selector: "h3" })).not.toBeInTheDocument();
    expect(screen.getByText("Enter text to find messages").parentElement?.querySelector("svg")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close message search" }));
    expect(onClose).toHaveBeenCalledOnce();
    onClose.mockClear();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Search messages" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the 400ms search debounce and exposes loading status", async () => {
    vi.useFakeTimers();
    searchMock.mockResolvedValue([]);
    render(<MessageSearch targetId={3} type="direct" onClose={vi.fn()} onJumpTo={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Search messages" });
    fireEvent.change(input, { target: { value: "hello" } });
    expect(searchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Searching...");
    await act(async () => {
      vi.advanceTimersByTime(399);
      await Promise.resolve();
    });
    expect(searchMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(searchMock).toHaveBeenCalledWith(3, "hello");
  });

  it("routes trimmed direct searches through the conversation fallback ref", async () => {
    vi.useFakeTimers();
    searchMock.mockResolvedValue([]);
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({
      currentUser: { id: 1 },
      conversationPreviews: { 3: { partner_public_id: "user-public-3" } },
      roomPreviews: {},
    }));
    render(<MessageSearch targetId={3} type="direct" onClose={vi.fn()} onJumpTo={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search messages" }), { target: { value: "  hello  " } });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(searchMock).toHaveBeenCalledWith("user-public-3", "hello");
  });

  it("routes room searches through the room fallback ref", async () => {
    vi.useFakeTimers();
    searchMock.mockResolvedValue([]);
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({
      currentUser: { id: 1 },
      conversationPreviews: {},
      roomPreviews: { 9: { public_id: "room-public-9" } },
    }));
    render(<MessageSearch targetId={9} type="room" onClose={vi.fn()} onJumpTo={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search messages" }), { target: { value: " room " } });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(searchMock).toHaveBeenCalledWith("room-public-9", "room");
  });

  it("keeps initial, loading, empty, and error states distinct", async () => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => {});
    searchMock.mockReturnValue(pending);
    render(<MessageSearch targetId={3} type="direct" onClose={vi.fn()} onJumpTo={vi.fn()} />);
    expect(screen.getByText("Enter text to find messages")).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Search messages" });
    fireEvent.change(input, { target: { value: "none" } });
    expect(screen.getByRole("status")).toHaveTextContent("Searching...");
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(screen.queryByText("Nothing found")).not.toBeInTheDocument();
    expect(screen.queryByText("Search error.")).not.toBeInTheDocument();
  });

  it("shows empty and error feedback with their existing semantics", async () => {
    vi.useFakeTimers();
    searchMock.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("failed"));
    render(<MessageSearch targetId={3} type="direct" onClose={vi.fn()} onJumpTo={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Search messages" });
    fireEvent.change(input, { target: { value: "none" } });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Nothing found");
    fireEvent.change(input, { target: { value: "failed" } });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Search error.");
  });

  it("ignores stale responses and preserves result activation", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (messages: Message[]) => void;
    let resolveSecond!: (messages: Message[]) => void;
    const first = new Promise<Message[]>((resolve) => { resolveFirst = resolve; });
    const second = new Promise<Message[]>((resolve) => { resolveSecond = resolve; });
    searchMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const onJumpTo = vi.fn();
    render(<MessageSearch targetId={3} type="direct" onClose={vi.fn()} onJumpTo={onJumpTo} />);
    const input = screen.getByRole("textbox", { name: "Search messages" });
    fireEvent.change(input, { target: { value: "first" } });
    await act(async () => { vi.advanceTimersByTime(400); await Promise.resolve(); });
    fireEvent.change(input, { target: { value: "second" } });
    await act(async () => { vi.advanceTimersByTime(400); await Promise.resolve(); });
    resolveSecond([{ id: 2, sender_username: "Second", inserted_at: "2026-01-02T00:00:00Z" } as Message]);
    await act(async () => { await Promise.resolve(); });
    resolveFirst([{ id: 1, sender_username: "First", inserted_at: "2026-01-01T00:00:00Z" } as Message]);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("1 result")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Second/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /First/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Second/ })).not.toHaveClass("border", "bg-card");
    fireEvent.click(screen.getByRole("button", { name: /Second/ }));
    expect(onJumpTo).toHaveBeenCalledWith(2);
  });

  it("uses plural result copy and keyboard-accessible result buttons", async () => {
    vi.useFakeTimers();
    searchMock.mockResolvedValue([
      { id: 1, sender_username: "One", inserted_at: "2026-01-01T00:00:00Z" },
      { id: 2, sender_username: "Two", inserted_at: "2026-01-02T00:00:00Z" },
    ] as Message[]);
    render(<MessageSearch targetId={3} type="direct" onClose={vi.fn()} onJumpTo={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Search messages" });
    fireEvent.change(input, { target: { value: "messages" } });
    await act(async () => { vi.advanceTimersByTime(400); await Promise.resolve(); });
    expect(screen.getByText("2 results")).toBeInTheDocument();
    const resultButtons = screen.getAllByRole("button").filter((button) => /One|Two/.test(button.textContent ?? ""));
    expect(resultButtons).toHaveLength(2);
    resultButtons.forEach((button) => expect(button).toHaveAttribute("type", "button"));
  });
});
