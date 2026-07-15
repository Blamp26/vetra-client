import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Server, User } from "@/shared/types";

const { useUserSearchMock, useAppStoreMock, setActiveChatMock } = vi.hoisted(() => ({
  useUserSearchMock: vi.fn(),
  useAppStoreMock: vi.fn(),
  setActiveChatMock: vi.fn(),
}));

vi.mock("@/features/messaging/hooks/useUserSearch", () => ({
  useUserSearch: () => useUserSearchMock(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));

vi.mock("@/shared/components/Avatar", () => ({
  Avatar: ({ name, status }: { name: string; status?: string }) => (
    <span data-testid={`avatar-${name}`} data-presence-status={status}>
      {name}
    </span>
  ),
}));

vi.mock("@/shared/utils/chatRoutes", () => ({
  directChatForUser: (user: User) => ({ type: "direct", userId: user.id }),
  serverChatForServer: (server: Server) => ({ type: "server", serverId: server.id }),
}));

vi.mock("@/shared/utils/presence", () => ({
  resolvePresenceStatus: () => "online",
}));

import { UserSearch } from "./UserSearch";

const user = { id: 4, username: "alex", display_name: "Alex", status: "online" } as User;
const server = { id: 8, name: "Design" } as Server;

describe("UserSearch combobox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({
      setActiveChat: setActiveChatMock,
      onlineUserIds: [],
      userStatuses: {},
      lastSeenAt: {},
    }));
    useUserSearchMock.mockReturnValue({
      query: "",
      setQuery: vi.fn(),
      searchResults: { users: [user], servers: [server] },
      isSearching: false,
      clearSearch: vi.fn(),
    });
  });

  it("exposes named grouped options and selects a user from the keyboard", () => {
    render(<UserSearch />);
    const input = screen.getByRole("combobox", { name: "Search people or servers" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("group", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Servers" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("option", { name: /Alex/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(setActiveChatMock).toHaveBeenCalledOnce();
    expect(setActiveChatMock).toHaveBeenCalledWith({ type: "direct", userId: user.id });
  });

  it("updates the query and selects a server through the keyboard", () => {
    const setQuery = vi.fn();
    useUserSearchMock.mockReturnValue({
      query: "des",
      setQuery,
      searchResults: { users: [], servers: [server] },
      isSearching: false,
      clearSearch: vi.fn(),
    });
    render(<UserSearch />);
    const input = screen.getByRole("combobox", { name: "Search people or servers" });
    fireEvent.change(input, { target: { value: "desi" } });
    expect(setQuery).toHaveBeenCalledWith("desi");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(setActiveChatMock).toHaveBeenCalledWith({ type: "server", serverId: server.id });
  });

  it("keeps presence and group labels accessible without kicker styling", () => {
    render(<UserSearch />);
    expect(screen.getByTestId("avatar-Alex")).toHaveAttribute("data-presence-status", "online");
    expect(screen.getByText("Users")).not.toHaveClass("vt-kicker");
    expect(screen.getByText("Servers")).not.toHaveClass("vt-kicker");
    expect(screen.getByTestId("avatar-Design")).toBeInTheDocument();
  });

  it("keeps the clear control named and closes without losing query semantics", () => {
    const clearSearch = vi.fn();
    useUserSearchMock.mockReturnValue({
      query: "alex",
      setQuery: vi.fn(),
      searchResults: { users: [], servers: [] },
      isSearching: false,
      clearSearch,
    });
    render(<UserSearch />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent('No results for "alex"');
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(clearSearch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(clearSearch).toHaveBeenCalledOnce();
  });
});
