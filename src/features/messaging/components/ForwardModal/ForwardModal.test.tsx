import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForwardModal } from "./ForwardModal";

const { useAppStoreMock } = vi.hoisted(() => ({ useAppStoreMock: vi.fn() }));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));

function makeState() {
  return {
    conversationPreviews: {
      1: {
        partner_id: 1,
        partner_public_id: "user-1",
        partner_username: "old",
        partner_display_name: "Old conversation",
        unread_count: 0,
        last_message: { id: 1, content: "old", inserted_at: "2026-07-01T10:00:00Z" },
      },
      2: {
        partner_id: 2,
        partner_public_id: "user-2",
        partner_username: "new",
        partner_display_name: "Newest conversation",
        unread_count: 0,
        last_message: { id: 2, content: "new", inserted_at: "2026-07-03T10:00:00Z" },
      },
    },
    roomPreviews: {
      3: {
        id: 3,
        public_id: "room-3",
        name: "Middle room",
        created_by: 1,
        server_id: null,
        inserted_at: "2026-07-01T09:00:00Z",
        unread_count: 0,
        last_message_at: "2026-07-02T10:00:00Z",
        last_message: null,
      },
    },
  };
}

describe("ForwardModal", () => {
  beforeEach(() => {
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector(makeState()));
  });

  it("uses canonical recent activity order and preserves it while searching", () => {
    render(<ForwardModal onForward={vi.fn()} onCancel={vi.fn()} />);

    const list = screen.getByTestId("forward-destination-list");
    expect(within(list).getAllByRole("button").map((button) => button.getAttribute("data-testid"))).toEqual([
      "forward-destination-direct-2",
      "forward-destination-room-3",
      "forward-destination-direct-1",
    ]);

    fireEvent.change(screen.getByRole("textbox", { name: "Search forwarding destinations" }), {
      target: { value: "conversation" },
    });
    expect(within(list).getAllByRole("button").map((button) => button.getAttribute("data-testid"))).toEqual([
      "forward-destination-direct-2",
      "forward-destination-direct-1",
    ]);
  });

  it("allows only one pending destination submission and keeps the modal on failure", async () => {
    let rejectForward!: (reason: Error) => void;
    const onForward = vi.fn(() => new Promise<void>((_, reject) => { rejectForward = reject; }));
    render(<ForwardModal onForward={onForward} onCancel={vi.fn()} />);

    const button = screen.getByTestId("forward-destination-direct-2");
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onForward).toHaveBeenCalledTimes(1);
    expect(onForward).toHaveBeenCalledWith(
      expect.objectContaining({ type: "direct", kind: "direct", id: 2, ref: "user-2" }),
    );
    expect(button).toHaveAttribute("data-pending", "true");
    expect(screen.getByTestId("forward-destination-direct-1")).toBeDisabled();

    rejectForward(new Error("forbidden"));
    expect(await screen.findByRole("alert")).toHaveTextContent("forbidden");
    expect(button).not.toBeDisabled();
  });

  it("shows a selected pending state until acknowledgement resolves", async () => {
    let resolveForward!: () => void;
    const onForward = vi.fn(() => new Promise<void>((resolve) => { resolveForward = resolve; }));
    render(<ForwardModal onForward={onForward} onCancel={vi.fn()} />);

    const button = screen.getByTestId("forward-destination-room-3");
    fireEvent.click(button);
    expect(onForward).toHaveBeenCalledWith(
      expect.objectContaining({ type: "room", kind: "room", id: 3, ref: "room-3" }),
    );
    expect(button).toHaveAttribute("data-pending", "true");
    resolveForward();
    await waitFor(() => expect(button).toHaveAttribute("data-pending", "true"));
  });
});
