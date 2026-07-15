import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileModal } from "./ProfileModal";

const { useAppStoreMock, updateProfileMock, postFormDataMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  updateProfileMock: vi.fn(),
  postFormDataMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));
vi.mock("@/api/auth", () => ({ authApi: { updateProfile: updateProfileMock } }));
vi.mock("@/api/base", () => ({
  API_BASE_URL: "http://localhost",
  postFormData: postFormDataMock,
}));

const user = {
  id: 1,
  username: "tester",
  display_name: "Tester",
  bio: "Hello",
  avatar_url: null,
  status: "online",
} as any;

describe("ProfileModal", () => {
  let storeState: any;

  beforeEach(() => {
    vi.clearAllMocks();
    storeState = {
      updateCurrentUser: vi.fn(),
      socketManager: { updateStatus: vi.fn() },
    };
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector(storeState));
  });

  it("is a named dialog with a safe editable initial focus", () => {
    render(<ProfileModal user={user} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Edit account details" })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Username"));
    expect(screen.getByRole("button", { name: "Close profile" })).toBeInTheDocument();
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
  });

  it("keeps avatar upload visible and keyboard-accessible", async () => {
    postFormDataMock.mockResolvedValue({ media_file_id: "avatar-1" });
    render(<ProfileModal user={user} onClose={vi.fn()} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");
    fireEvent.click(screen.getByRole("button", { name: "Change avatar" }));
    expect(clickSpy).toHaveBeenCalledOnce();

    fireEvent.change(fileInput, { target: { files: [new File(["avatar"], "avatar.png", { type: "image/png" })] } });
    expect(await screen.findByDisplayValue("http://localhost/media/avatar-1")).toBeInTheDocument();
  });

  it("exposes status as one semantic single-choice group", () => {
    render(<ProfileModal user={user} onClose={vi.fn()} />);

    const statusGroup = screen.getByRole("radiogroup", { name: "Status" });
    expect(statusGroup).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "Online" })).toBeChecked();
    expect(screen.getAllByRole("radio").filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(1);

    fireEvent.click(screen.getByRole("radio", { name: "Away" }));
    expect(screen.getByRole("radio", { name: "Away" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Online" })).not.toBeChecked();
  });

  it("preserves profile validation and save payload", async () => {
    updateProfileMock.mockResolvedValue(user);
    render(<ProfileModal user={user} onClose={vi.fn()} />);
    const username = screen.getByLabelText("Username");
    fireEvent.change(username, { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Min 2 chars");
    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(username).toHaveAttribute("aria-describedby", screen.getByRole("alert").id);

    fireEvent.change(username, { target: { value: "updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateProfileMock).toHaveBeenCalledWith(1, expect.objectContaining({ username: "updated" }));
  });

  it("preserves the complete save payload and account updates", async () => {
    const onClose = vi.fn();
    const updated = { ...user, username: "updated", status: "away" };
    updateProfileMock.mockResolvedValue(updated);
    render(<ProfileModal user={user} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("Avatar URL"), { target: { value: " https://avatar.example/me.png " } });
    fireEvent.change(screen.getByLabelText("Display Name"), { target: { value: " Updated Tester " } });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: " updated " } });
    fireEvent.change(screen.getByLabelText("Bio"), { target: { value: " Bio text " } });
    fireEvent.click(screen.getByRole("radio", { name: "Away" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledWith(1, {
      username: "updated",
      display_name: "Updated Tester",
      bio: "Bio text",
      avatar_url: "https://avatar.example/me.png",
      status: "away",
    }));
    expect(storeState.updateCurrentUser).toHaveBeenCalledWith(updated);
    expect(storeState.socketManager.updateStatus).toHaveBeenCalledWith("away");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps Save labelled while saving", () => {
    updateProfileMock.mockReturnValue(new Promise(() => {}));
    render(<ProfileModal user={user} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("aria-busy", "true");
  });

  it("keeps upload and save failures visible as alerts", async () => {
    postFormDataMock.mockRejectedValueOnce(new Error("upload"));
    render(<ProfileModal user={user} onClose={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["avatar"], "avatar.png", { type: "image/png" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload error");

    updateProfileMock.mockRejectedValueOnce(new Error("save"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save error");
  });

  it("removes the old avatar panel wrapper", () => {
    render(<ProfileModal user={user} onClose={vi.fn()} />);
    const avatarSection = screen.getByTestId("profile-avatar-section");
    expect(avatarSection).not.toHaveClass("vt-panel");
  });
});
