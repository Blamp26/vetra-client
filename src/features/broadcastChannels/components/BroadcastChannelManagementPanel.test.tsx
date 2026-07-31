import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { BroadcastChannelManagementPanel } from "./BroadcastChannelManagementPanel";

const api = vi.hoisted(() => ({
  governance: vi.fn(), administrators: vi.fn(), pendingRequests: vi.fn(), ownership: vi.fn(), invite: vi.fn(), subscribers: vi.fn(),
  settings: vi.fn(), appointAdministrator: vi.fn(), updateAdministrator: vi.fn(), removeAdministrator: vi.fn(), transferOwnership: vi.fn(),
  createInvite: vi.fn(), regenerateInvite: vi.fn(), disableInvite: vi.fn(), approveRequest: vi.fn(), rejectRequest: vi.fn(), block: vi.fn(),
  acceptOwnership: vi.fn(), declineOwnership: vi.fn(), declineAdministrator: vi.fn(), leave: vi.fn(),
}));
vi.mock("@/api/broadcastChannels", () => ({ broadcastChannelsApi: api }));
vi.mock("@/api/base", () => ({ postFormData: vi.fn() }));

describe("broadcast channel management", () => {
  it("renders the exact six capabilities and makes ban_users imply subscribers", async () => {
    api.governance.mockResolvedValue({ role: "owner", tier: "owner", capabilities: [] });
    api.administrators.mockResolvedValue([]); api.pendingRequests.mockResolvedValue([]); api.ownership.mockResolvedValue({ decline_available: false }); api.invite.mockResolvedValue(null); api.subscribers.mockResolvedValue([]);
    render(<BroadcastChannelManagementPanel channelId="channel-public" channelVisibility="private" description="old" onClose={vi.fn()} onRefresh={vi.fn().mockResolvedValue(undefined)} />);
    await waitFor(() => expect(screen.getByText("Administrators")).toBeInTheDocument());
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    const ban = screen.getByRole("checkbox", { name: "ban_users" });
    fireEvent.click(ban);
    expect(screen.getByRole("checkbox", { name: "view_subscribers" })).toBeChecked();
  });

  it("keeps invite state in memory and clears it on close", async () => {
    api.governance.mockResolvedValue({ role: "owner", tier: "owner", capabilities: [] }); api.administrators.mockResolvedValue([]); api.pendingRequests.mockResolvedValue([]); api.ownership.mockResolvedValue({ decline_available: false }); api.invite.mockResolvedValue({ token: "secret-token", channel_public_id: "channel-public", created_at: "2026-01-01" }); api.subscribers.mockResolvedValue([]);
    const onClose = vi.fn();
    const { unmount } = render(<BroadcastChannelManagementPanel channelId="channel-public" channelVisibility="private" onClose={onClose} onRefresh={vi.fn().mockResolvedValue(undefined)} />);
    await waitFor(() => expect(screen.getByText(/secret-token/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
  });

  it("does not expose profile or governance mutation controls to a limited administrator", async () => {
    api.governance.mockResolvedValue({ role: "administrator", tier: "limited", capabilities: ["publish"] });
    api.administrators.mockRejectedValue(new Error("forbidden"));
    render(<BroadcastChannelManagementPanel channelId="channel-public" channelVisibility="public" onClose={vi.fn()} onRefresh={vi.fn().mockResolvedValue(undefined)} />);
    await waitFor(() => expect(screen.getByText("Channel management unavailable")).toBeInTheDocument());
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
    expect(screen.queryByText("Administrators")).not.toBeInTheDocument();
  });
});
