import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateProfile, postFormData, upsertRoomPreview } = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  postFormData: vi.fn(),
  upsertRoomPreview: vi.fn(),
}));

vi.mock("@/api/rooms", () => ({ roomsApi: { updateProfile } }));
vi.mock("@/api/base", () => ({ postFormData }));
vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector({ upsertRoomPreview }),
}));
vi.mock("@/shared/components/Avatar", () => ({ Avatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div> }));
vi.mock("./AvatarCropDialog", () => ({
  GROUP_AVATAR_MAX_UPLOAD_SIZE: 15_000_000,
  GROUP_AVATAR_TYPES: ["image/png", "image/jpeg", "image/gif", "image/webp"],
  isSupportedGroupAvatar: (file: { type: string; size: number }) =>
    ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type) && file.size <= 15_000_000,
  AvatarCropDialog: ({ onCancel, onSetPhoto }: { onCancel: () => void; onSetPhoto: (blob: Blob) => void }) => (
    <div role="dialog" aria-label="Crop photo">
      <button onClick={onCancel}>Cancel crop</button>
      <button onClick={() => onSetPhoto(new Blob(["cropped"], { type: "image/png" }))}>Set photo</button>
    </div>
  ),
}));

import { GroupBasicInfoEditor } from "./GroupBasicInfoEditor";

const room = {
  id: 7,
  public_id: "room-seven",
  name: "Project Seven",
  description: "Existing description",
  avatar_media_file_id: "avatar-seven",
  avatar_url: "/api/v1/media/avatar-seven",
  created_by: 1,
  server_id: null,
  inserted_at: "2026-07-01T00:00:00Z",
  unread_count: 0,
  last_message_at: null,
  last_message: null,
} as any;

const updatedRoom = { ...room, name: "Updated group", description: null, avatar_media_file_id: null, avatar_url: null };

describe("GroupBasicInfoEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Image", class {
      src = "";
      decode = async () => undefined;
    });
    updateProfile.mockResolvedValue(updatedRoom);
    postFormData.mockResolvedValue({ media_file_id: "uploaded-avatar" });
  });

  it("populates the complete local draft and rejects an empty name without API activity", async () => {
    render(<GroupBasicInfoEditor room={room} onClose={vi.fn()} />);
    expect(screen.getByDisplayValue("Project Seven")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Existing description")).toBeInTheDocument();
    const name = screen.getByLabelText("Group name");
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText("Group name is required.")).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(postFormData).not.toHaveBeenCalled();
  });

  it("normalizes description whitespace and discards the draft on cancel", () => {
    const onClose = vi.fn();
    render(<GroupBasicInfoEditor room={room} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Changed" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("only shows Remove photo when an avatar exists and saves removal as null without upload", async () => {
    render(<GroupBasicInfoEditor room={room} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Change group photo" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove photo" }));
    expect(screen.queryByRole("menuitem", { name: "Remove photo" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith("room-seven", {
      name: "Project Seven",
      description: "Existing description",
      avatar_media_file_id: null,
    }));
    expect(postFormData).not.toHaveBeenCalled();
  });

  it("does not show removal without an avatar and sends an image clipboard blob through crop", async () => {
    const clipboardBlob = new Blob(["clipboard"], { type: "image/png" });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { read: vi.fn().mockResolvedValue([{ types: ["image/png"], getType: vi.fn().mockResolvedValue(clipboardBlob) }]) },
    });
    render(<GroupBasicInfoEditor room={{ ...room, avatar_media_file_id: null, avatar_url: null }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Change group photo" }));
    expect(screen.queryByRole("menuitem", { name: "Remove photo" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Paste from clipboard" }));
    expect(await screen.findByRole("dialog", { name: "Crop photo" })).toBeInTheDocument();
    expect(postFormData).not.toHaveBeenCalled();
  });

  it("rejects unsupported and oversized files before opening crop", async () => {
    render(<GroupBasicInfoEditor room={{ ...room, avatar_media_file_id: null, avatar_url: null }} onClose={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "note.txt", { type: "text/plain" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use PNG, JPEG, GIF, WEBP");
    expect(screen.queryByRole("dialog", { name: "Crop photo" })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(15_000_001)], "big.png", { type: "image/png" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("15 MB");
  });

  it("opens crop for a valid file, does not upload before Save, and reuses a returned media id on retry", async () => {
    const firstFailure = new Error("profile update failed");
    updateProfile.mockRejectedValueOnce(firstFailure).mockResolvedValueOnce(updatedRoom);
    render(<GroupBasicInfoEditor room={{ ...room, avatar_media_file_id: null, avatar_url: null }} onClose={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["image"], "photo.png", { type: "image/png" })] } });
    expect(await screen.findByRole("dialog", { name: "Crop photo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set photo" }));
    expect(postFormData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(postFormData).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("profile update failed"));
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2));
    expect(postFormData).toHaveBeenCalledOnce();
    expect(upsertRoomPreview).toHaveBeenCalledWith(updatedRoom);
  });

  it("prevents duplicate saves while upload and profile persistence are pending", async () => {
    let resolveUpload!: (value: { media_file_id: string }) => void;
    postFormData.mockReturnValueOnce(new Promise((resolve) => { resolveUpload = resolve; }));
    render(<GroupBasicInfoEditor room={{ ...room, avatar_media_file_id: null, avatar_url: null }} onClose={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["image"], "photo.png", { type: "image/png" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Set photo" }));
    fireEvent.click(screen.getByText("Save"));
    fireEvent.click(screen.getByText("Save"));
    expect(postFormData).toHaveBeenCalledOnce();
    resolveUpload({ media_file_id: "uploaded-avatar" });
  });
});
