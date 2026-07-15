import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileModal } from "./ProfileModal";

const { useAppStoreMock, updateProfileMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  updateProfileMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));
vi.mock("@/api/auth", () => ({ authApi: { updateProfile: updateProfileMock } }));
vi.mock("@/api/base", () => ({
  API_BASE_URL: "http://localhost",
  postFormData: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({
      updateCurrentUser: vi.fn(),
      socketManager: { updateStatus: vi.fn() },
    }));
  });

  it("is a named dialog with a safe editable initial focus", () => {
    render(<ProfileModal user={user} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Edit account details" })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Username"));
    expect(screen.getByRole("button", { name: "Close profile" })).toBeInTheDocument();
  });

  it("preserves profile validation and save payload", async () => {
    updateProfileMock.mockResolvedValue(user);
    render(<ProfileModal user={user} onClose={vi.fn()} />);
    const username = screen.getByLabelText("Username");
    fireEvent.change(username, { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Min 2 chars");
    expect(username).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(username, { target: { value: "updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateProfileMock).toHaveBeenCalledWith(1, expect.objectContaining({ username: "updated" }));
  });
});
