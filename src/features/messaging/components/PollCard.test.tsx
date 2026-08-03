import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PollCard } from "./PollCard";

describe("PollCard", () => {
  it("renders options and sends the server-authoritative vote", async () => {
    const votePoll = vi.fn().mockResolvedValue({
      id: 1, question: "Pick", status: "active", settings: {}, selected_option_ids: [2],
      options: [{ id: 1, label: "A", position: 0, votes: 0, voter_ids: [] }, { id: 2, label: "B", position: 1, votes: 1, voter_ids: [7] }],
    });
    const socketManager = { votePoll, onPollUpdated: vi.fn(() => () => void 0) } as any;
    render(<PollCard roomId={4} messageId={9} socketManager={socketManager} poll={{ id: 1, question: "Pick", status: "active", settings: {}, selected_option_ids: [], options: [{ id: 1, label: "A", position: 0, votes: 0, voter_ids: [] }, { id: 2, label: "B", position: 1, votes: 0, voter_ids: [] }] }} />);
    fireEvent.click(screen.getByLabelText("B"));
    fireEvent.click(screen.getByRole("button", { name: "Vote" }));
    await waitFor(() => expect(votePoll).toHaveBeenCalledWith(4, 9, [2]));
  });
});
