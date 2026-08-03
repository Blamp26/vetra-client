import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import {
  GroupBasicInfoFields,
  type GroupBasicInfoController,
} from "./GroupBasicInfoEditor";

function controller(
  avatarPreviewUrl: string | null = null,
): GroupBasicInfoController {
  return {
    draft: {
      name: "Group",
      description: "",
      avatarMediaFileId: null,
      avatarPreviewUrl,
      avatarBlob: null,
      uploadedMediaId: null,
    },
    cropSource: null,
    setCropSource: vi.fn(),
    avatarMenuOpen: false,
    setAvatarMenuOpen: vi.fn(),
    nameTouched: false,
    setNameTouched: vi.fn(),
    error: null,
    saving: false,
    stage: "idle",
    nameError: null,
    dirty: false,
    saveDisabled: true,
    fileInputRef: createRef<HTMLInputElement>(),
    editorRef: createRef<HTMLDivElement>(),
    chooseFile: vi.fn(),
    pasteFromClipboard: vi.fn(),
    removePhoto: vi.fn(),
    replacePreview: vi.fn(),
    setDraft: vi.fn(),
    save: vi.fn(),
  };
}

describe("GroupBasicInfoFields", () => {
  it("fills the 72px avatar editor with either initials or an image preview", () => {
    const { rerender } = render(
      <GroupBasicInfoFields
        room={{ id: 7, name: "Group" } as any}
        titleId="group-title"
        descriptionId="group-description"
        controller={controller()}
      />,
    );

    const avatarButton = screen.getByRole("button", { name: "Change group photo" });
    expect(avatarButton).toHaveClass("h-[72px]", "w-[72px]", "[&>div]:h-full", "[&>div]:w-full");
    expect(avatarButton.querySelector('[data-slot="avatar"]')).toHaveClass("h-full", "w-full");

    rerender(
      <GroupBasicInfoFields
        room={{ id: 7, name: "Group" } as any}
        titleId="group-title"
        descriptionId="group-description"
        controller={controller("blob:group-avatar")}
      />,
    );
    expect(screen.getByAltText("Group avatar preview")).toHaveClass("h-full", "w-full", "object-cover");
  });
});
