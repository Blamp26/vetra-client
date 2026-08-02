import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  groupSurface: null as any,
  roomPreviews: { 7: { id: 7, name: "Group Seven" } },
  openGroupSettings: vi.fn(),
  backToGroupProfile: vi.fn(),
  closeGroupSurface: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

vi.mock("../GroupProfileModal", () => ({
  GroupProfileModal: ({ onManage, onClose }: any) => (
    <div role="dialog" aria-label="Group profile" data-testid="profile-owner">
      <button onClick={onManage}>Manage</button>
      <button onClick={onClose}>Close profile</button>
    </div>
  ),
}));

vi.mock("../GroupSettingsModal/GroupSettingsModal", () => ({
  GroupSettingsModal: ({ onBack, onClose }: any) => (
    <div role="dialog" aria-label="Group settings" data-testid="settings-owner">
      {onBack && <button onClick={onBack}>Back to group profile</button>}
      <button onClick={onClose}>Close settings</button>
    </div>
  ),
}));

import { GroupManagementHost } from "./GroupManagementHost";

describe("GroupManagementHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.groupSurface = null;
  });

  it("routes profile Manage to the shared settings flow with one dialog owner", () => {
    state.groupSurface = {
      roomId: 7,
      view: "profile",
      restoreFocus: null,
      onSearchMessages: vi.fn(),
    };
    const { rerender } = render(<GroupManagementHost />);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(state.openGroupSettings).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ settingsOrigin: "profile" }),
    );

    state.groupSurface = { ...state.groupSurface, view: "settings", settingsOrigin: "profile" };
    rerender(<GroupManagementHost />);
    expect(screen.queryByTestId("profile-owner")).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Back to group profile" }));
    expect(state.backToGroupProfile).toHaveBeenCalledOnce();

    state.groupSurface = { ...state.groupSurface, view: "profile", settingsOrigin: undefined };
    rerender(<GroupManagementHost />);
    expect(screen.queryByTestId("settings-owner")).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("closes Sidebar-origin settings directly to chat without a hidden profile", () => {
    state.groupSurface = {
      roomId: 7,
      view: "settings",
      settingsOrigin: "sidebar",
      restoreFocus: null,
    };
    const { rerender } = render(<GroupManagementHost />);
    expect(screen.queryByTestId("profile-owner")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to group profile" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(state.closeGroupSurface).toHaveBeenCalledOnce();
    state.groupSurface = null;
    rerender(<GroupManagementHost />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
