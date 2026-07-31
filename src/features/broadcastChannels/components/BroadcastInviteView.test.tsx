import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { BroadcastInviteView } from "./BroadcastInviteView";

const mocks = vi.hoisted(() => ({ resolveInvite: vi.fn(), submitJoinRequest: vi.fn() }));
vi.mock("@/api/broadcastChannels", () => ({ broadcastChannelsApi: mocks }));

describe("broadcast invite opening", () => {
  it("submits a request without navigating into the channel", async () => {
    mocks.resolveInvite.mockResolvedValue({ channel_public_id: "channel-public", display_name: "News", visibility: "private", status: "active" });
    mocks.submitJoinRequest.mockResolvedValue({ status: "pending" });
    render(<BroadcastInviteView token="opaque-token" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Request access" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Request access" }));
    await waitFor(() => expect(screen.getByText("Your request is pending.")).toBeInTheDocument());
    expect(mocks.submitJoinRequest).toHaveBeenCalledWith("opaque-token");
    expect(window.location.hash).not.toContain("channel-public");
  });
});
