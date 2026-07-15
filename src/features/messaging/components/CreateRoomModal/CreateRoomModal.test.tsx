import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock } = vi.hoisted(() => ({ useAppStoreMock: vi.fn() }));
const appState = {
  currentUser: { id: 1 },
  socketManager: null,
  setActiveChat: vi.fn(),
  upsertRoomPreview: vi.fn(),
};

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));
vi.mock("@/shared/components/Avatar", () => ({ Avatar: () => <span /> }));

import { CreateRoomModal } from "./CreateRoomModal";

describe("CreateRoomModal dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector(appState));
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
});
