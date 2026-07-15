import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateServerModal } from "./CreateServerModal";

const { useAppStoreMock, createMock, upsertServerMock, setActiveChatMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  createMock: vi.fn(),
  upsertServerMock: vi.fn(),
  setActiveChatMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));
vi.mock("@/api/servers", () => ({ serversApi: { create: createMock } }));

describe("CreateServerModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({
      currentUser: { id: 1 },
      upsertServer: upsertServerMock,
      setActiveChat: setActiveChatMock,
    }));
  });

  it("uses the shared dialog semantics and safe initial focus", () => {
    render(<CreateServerModal onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Create Server" })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Server name"));
    expect(screen.getByRole("button", { name: "Close create server" })).toBeInTheDocument();
  });

  it("keeps validation associated with the server name field", () => {
    render(<CreateServerModal onClose={vi.fn()} />);
    const input = screen.getByLabelText("Server name");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", screen.getByRole("alert").id);
  });

  it("submits the original server name once", async () => {
    const onClose = vi.fn();
    createMock.mockResolvedValue({ id: 4, name: "Vetra" });
    render(<CreateServerModal onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: " Vetra " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(createMock).toHaveBeenCalledOnce();
    expect(createMock).toHaveBeenCalledWith("Vetra");
    expect(upsertServerMock).toHaveBeenCalledWith({ id: 4, name: "Vetra" });
    expect(setActiveChatMock).toHaveBeenCalledOnce();
  });

  it("keeps Escape and backdrop closing and removes redundant card styling", () => {
    const onClose = vi.fn();
    render(<CreateServerModal onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Create Server" });
    expect(dialog).not.toHaveClass("bg-card");
    expect(dialog).not.toHaveClass("border");
    expect(screen.getByLabelText("Server name")).not.toHaveClass("bg-background");
    expect(screen.getByText("Server name")).not.toHaveClass("uppercase");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.mouseDown(screen.getByTestId("dialog-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows create failures as alerts", async () => {
    createMock.mockRejectedValue(new Error("network"));
    render(<CreateServerModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "Vetra" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Create failed");
  });

  it("prevents duplicate creation while loading and keeps Create labelled", async () => {
    let resolveCreate!: (value: { id: number; name: string }) => void;
    createMock.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    render(<CreateServerModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "Vetra" } });
    const createButton = screen.getByRole("button", { name: "Create" });
    fireEvent.click(createButton);
    expect(createButton).toHaveAttribute("aria-busy", "true");
    expect(createButton).toBeDisabled();
    fireEvent.click(createButton);
    expect(createMock).toHaveBeenCalledOnce();
    resolveCreate({ id: 4, name: "Vetra" });
    await waitFor(() => expect(upsertServerMock).toHaveBeenCalledOnce());
  });
});
