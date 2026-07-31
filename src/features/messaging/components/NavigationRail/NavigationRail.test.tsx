import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock, selectConversations, selectServer, openModal } =
  vi.hoisted(() => ({
    useAppStoreMock: vi.fn(),
    selectConversations: vi.fn(),
    selectServer: vi.fn(),
    openModal: vi.fn(),
  }));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
}));
vi.mock("@/api/servers", () => ({ serversApi: { getList: vi.fn() } }));

import { NavigationRail } from "./NavigationRail";

const state: any = {
  currentUser: null,
  servers: {},
  setServers: vi.fn(),
  serverChannels: {},
  channelUnread: {},
  conversationPreviews: {},
  roomPreviews: {},
  railContext: { type: "conversations" as const },
  selectConversations,
  selectServer,
  openModal,
};

describe("NavigationRail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStoreMock.mockImplementation(
      (selector: (value: typeof state) => unknown) => selector(state),
    );
  });

  it("renders conversations and create-server controls with no data", () => {
    render(<NavigationRail />);
    expect(screen.getByRole("button", { name: "Conversations" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Create server" })).toBeVisible();
  });

  it("renders servers separately and supports keyboard activation", () => {
    state.servers = { 5: { id: 5, name: "Alpha" } as never };
    render(<NavigationRail />);
    const server = screen.getByRole("button", { name: "Alpha" });
    expect(server).toHaveAttribute("title", "Alpha");
    fireEvent.click(server);
    expect(selectServer).toHaveBeenCalledWith(5);
    fireEvent.keyDown(screen.getByRole("button", { name: "Conversations" }), {
      key: "ArrowDown",
    });
    expect(document.activeElement).toBe(server);
  });

  it("opens the existing server modal directly", () => {
    render(<NavigationRail />);
    fireEvent.click(screen.getByRole("button", { name: "Create server" }));
    expect(openModal).toHaveBeenCalledWith("CREATE_SERVER");
  });
});
