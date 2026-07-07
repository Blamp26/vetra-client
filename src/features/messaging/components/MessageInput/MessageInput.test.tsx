import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
}));

import { MessageInput } from "./MessageInput";

function makeState() {
  return {
    editingMessage: null,
    cancelEditing: vi.fn(),
    socketManager: null,
    activeChat: null,
    conversationPreviews: {},
    currentUser: { id: 1 },
    authToken: "secret-token",
  };
}

describe("MessageInput attachments", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    useAppStoreMock.mockImplementation(
      (selector: (state: ReturnType<typeof makeState>) => unknown) =>
        selector(makeState()),
    );

    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  it("accepts PDFs and shows the pending file card", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });

    expect(input).toHaveAttribute(
      "accept",
      "image/png,image/jpeg,image/gif,application/pdf,video/mp4,video/webm,video/ogg",
    );

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("File · 3 B")).toBeInTheDocument();
  });

  it("keeps composer controls aligned with simple button and input styling", () => {
    render(<MessageInput onSend={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Attach" })).toHaveClass("min-h-11");
    expect(screen.getByPlaceholderText("Message...")).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Send" })).toHaveClass("min-h-11");
  });

  it("sends typed text with the existing send action", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageInput onSend={onSend} />);

    fireEvent.change(screen.getByPlaceholderText("Message..."), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith({ content: "Hello", mediaFileId: null }, undefined);
  });

  it("accepts images and labels them as photos", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array(1024)], "photo.png", {
      type: "image/png",
    });

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText("Photo · 1.0 KB")).toBeInTheDocument();
    expect(screen.getByAltText("preview")).toBeInTheDocument();
  });

  it("rejects unsupported file types before upload", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["plain text"], "notes.txt", { type: "text/plain" });

    fireEvent.change(input, { target: { files: [file] } });

    expect(
      screen.getByText(
        "Unsupported file type. Allowed: PNG, JPG, GIF, PDF, MP4, WEBM, OGG.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  });
});
