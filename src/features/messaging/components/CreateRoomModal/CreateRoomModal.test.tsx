import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock, searchUsersMock, createRoomMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  searchUsersMock: vi.fn(),
  createRoomMock: vi.fn(),
}));
const appState = {
  currentUser: { id: 1 },
  socketManager: null as { joinRoomChannel: (...args: [number, number | string]) => Promise<void> } | null,
  setActiveChat: vi.fn(),
  upsertRoomPreview: vi.fn(),
};

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));
vi.mock("@/api/auth", () => ({ authApi: { searchUsers: searchUsersMock } }));
vi.mock("@/api/rooms", () => ({ roomsApi: { create: createRoomMock } }));
vi.mock("@/shared/components/Avatar", () => ({ Avatar: () => <span /> }));

import { CreateRoomModal } from "./CreateRoomModal";

describe("CreateRoomModal dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appState.socketManager = null;
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector(appState));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses Dialog and focuses the labelled group-name field", () => {
    render(<CreateRoomModal onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Create Group" });
    const name = screen.getByLabelText("Group name");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(name).toHaveFocus();
    expect(screen.getByRole("button", { name: "Close create group" })).toBeInTheDocument();
  });

  it("lets Combobox consume the first Escape before closing the dialog", () => {
    const onClose = vi.fn();
    render(<CreateRoomModal onClose={onClose} />);
    const memberInput = screen.getByRole("combobox", { name: "Add members" });
    fireEvent.change(memberInput, { target: { value: "alex" } });
    fireEvent.keyDown(memberInput, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Create Group" })).toBeInTheDocument();
    expect(memberInput).toHaveValue("alex");
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Create Group" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps create failures visible and removes redundant field and chip styling", async () => {
    createRoomMock.mockRejectedValue(new Error("network"));
    render(<CreateRoomModal onClose={vi.fn()} />);
    const name = screen.getByLabelText("Group name");
    fireEvent.change(name, { target: { value: "Team" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Create failed");
    expect(name).not.toHaveClass("bg-background");
    expect(screen.getByText("Group name")).not.toHaveClass("uppercase");
    expect(screen.queryByText("×")).not.toBeInTheDocument();
  });

  it("debounces member search, supports keyboard selection, and excludes selected users", async () => {
    vi.useFakeTimers();
    const alex = { id: 2, username: "alex", display_name: "Alex", public_id: "alex-public" };
    const blair = { id: 3, username: "blair", display_name: "Blair", public_id: "blair-public" };
    searchUsersMock.mockResolvedValue({ users: [alex, blair] });
    render(<CreateRoomModal onClose={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Add members" });
    fireEvent.change(input, { target: { value: "a" } });
    expect(searchUsersMock).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(searchUsersMock).toHaveBeenCalledOnce();
    expect(searchUsersMock).toHaveBeenCalledWith("a");
    expect(screen.getByRole("option", { name: /Alex/ })).toBeInTheDocument();
    await act(async () => { fireEvent.keyDown(input, { key: "ArrowDown" }); });
    expect(screen.getByRole("option", { name: /Alex/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Remove Alex" })).toBeInTheDocument();
    expect(input).toHaveValue("");

    fireEvent.change(input, { target: { value: "a" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.queryByRole("option", { name: /Alex/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Blair/ })).toBeInTheDocument();
  });

  it("creates with trimmed name and member refs while preserving preview, socket, routing, and close behavior", async () => {
    vi.useFakeTimers();
    const alex = { id: 2, username: "alex", display_name: "Alex", public_id: "alex-public" };
    const socketManager = { joinRoomChannel: vi.fn().mockRejectedValue(new Error("offline")) };
    const onClose = vi.fn();
    const room = { id: 9, public_id: "room-9", name: "Team", created_by: 1, created_by_public_id: "user-1", inserted_at: "now" };
    appState.socketManager = socketManager;
    createRoomMock.mockResolvedValue(room);
    searchUsersMock.mockResolvedValue({ users: [alex] });
    render(<CreateRoomModal onClose={onClose} />);
    const memberInput = screen.getByRole("combobox", { name: "Add members" });
    fireEvent.change(memberInput, { target: { value: "a" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await act(async () => { fireEvent.keyDown(memberInput, { key: "ArrowDown" }); });
    expect(screen.getByRole("option", { name: /Alex/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(memberInput, { key: "Enter" });
    vi.useRealTimers();
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: " Team " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(createRoomMock).toHaveBeenCalledWith("Team", ["alex-public"]);
    expect(appState.upsertRoomPreview).toHaveBeenCalledOnce();
    expect(socketManager.joinRoomChannel).toHaveBeenCalledWith(9, "room-9");
    expect(appState.setActiveChat).toHaveBeenCalledOnce();
  });

  it("keeps Create labelled and blocks duplicate submissions while loading", async () => {
    let resolveCreate!: (value: { id: number; name: string }) => void;
    createRoomMock.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    render(<CreateRoomModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Team" } });
    const createButton = screen.getByRole("button", { name: "Create" });
    fireEvent.click(createButton);
    expect(createButton).toHaveAttribute("aria-busy", "true");
    expect(createButton).toBeDisabled();
    fireEvent.click(createButton);
    expect(createRoomMock).toHaveBeenCalledOnce();
    resolveCreate({ id: 9, name: "Team" });
    await waitFor(() => expect(appState.upsertRoomPreview).toHaveBeenCalledOnce());
  });
});
