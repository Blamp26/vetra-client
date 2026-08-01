import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BroadcastChannelWorkspace } from "./BroadcastChannelWorkspace";

const channel = {
  public_id: "channel-public-id",
  display_name: "TestBroadcast",
  username: "testbroadcast",
  visibility: "public" as const,
  status: "active" as const,
  subscriber_count: 1,
  realtime_topic: "broadcast_channel:channel-public-id:0",
};

const api = vi.hoisted(() => ({
  get: vi.fn(),
  resolveUsername: vi.fn(),
  feed: vi.fn(),
  subscription: vi.fn(),
  governance: vi.fn(),
  pinned: vi.fn(),
}));

const state = vi.hoisted(() => ({
  currentUser: { public_id: "user-public-id", username: "me" },
  broadcastChannels: {} as Record<string, any>,
  broadcastPublications: {},
  broadcastCursors: {},
  broadcastUnread: {},
  broadcastSubscriptions: {},
  setBroadcastChannel: vi.fn(),
  setBroadcastFeed: vi.fn(),
  setBroadcastSubscription: vi.fn(),
  setBroadcastUnread: vi.fn(),
  socketManager: null,
  clearBroadcastChannel: vi.fn(),
}));

vi.mock("@/api/broadcastChannels", () => ({ broadcastChannelsApi: api }));
vi.mock("@/store", () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state),
  getState: () => state,
}));
vi.mock("@/shared/utils/storage", () => ({ storage: { getString: vi.fn(() => null), setString: vi.fn(), remove: vi.fn() } }));
vi.mock("../services/broadcastRealtime", () => ({ joinBroadcastTopic: vi.fn(() => undefined) }));
vi.mock("@/api/base", () => ({ postFormData: vi.fn() }));
vi.mock("@/shared/components/Button", () => ({ Button: ({ children, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock("@/shared/components/EmptyPane", () => ({ EmptyPane: ({ title, description }: any) => <div><h1>{title}</h1>{description && <p>{description}</p>}</div> }));
vi.mock("./BroadcastChannelManagementPanel", () => ({ BroadcastChannelManagementPanel: () => null }));

describe("broadcast channel sidebar-to-workspace navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.broadcastChannels = {};
    api.get.mockResolvedValue(channel);
    api.resolveUsername.mockResolvedValue(channel);
    api.feed.mockResolvedValue({ channel, publications: [], next_cursor: null });
    api.subscription.mockResolvedValue(null);
    api.governance.mockResolvedValue(null);
    api.pinned.mockResolvedValue([]);
  });

  it("renders a subscribed channel from the immutable public ID even before the cache write is visible", async () => {
    render(<BroadcastChannelWorkspace channelId={channel.public_id} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "TestBroadcast" })).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith(channel.public_id);
    expect(api.feed).toHaveBeenCalledWith(channel.public_id);
    expect(screen.queryByText("Channel unavailable")).not.toBeInTheDocument();
  });

  it("keeps root-username navigation resolving to the same immutable public ID", async () => {
    window.history.replaceState(null, "", "/testbroadcast");

    render(<BroadcastChannelWorkspace />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "TestBroadcast" })).toBeInTheDocument());
    expect(api.resolveUsername).toHaveBeenCalledWith("testbroadcast");
    expect(api.feed).toHaveBeenCalledWith(channel.public_id);

    window.history.replaceState(null, "", "/");
  });
});
