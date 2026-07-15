import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock, searchMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  searchMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));
vi.mock("@/api/messages", () => ({ messagesApi: { search: searchMock } }));
vi.mock("@/api/rooms", () => ({ roomsApi: { search: searchMock } }));
vi.mock("@/shared/components/Avatar", () => ({ Avatar: ({ name }: { name: string }) => <span>{name}</span> }));
vi.mock("../../utils/attachments", () => ({ getPreviewText: () => "Preview" }));
vi.mock("@/shared/utils/refs", () => ({ withFallbackRef: (id: number) => id }));

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

  it("uses the visible Search heading, named input, and initial focus", () => {
    render(<MessageSearch targetId={3} type="direct" onClose={vi.fn()} onJumpTo={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search messages" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Close message search" })).toBeInTheDocument();
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
});
