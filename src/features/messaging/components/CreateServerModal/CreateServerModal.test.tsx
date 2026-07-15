import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateServerModal } from "./CreateServerModal";

const { useAppStoreMock, createMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  createMock: vi.fn(),
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
      upsertServer: vi.fn(),
      setActiveChat: vi.fn(),
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
    createMock.mockResolvedValue({ id: 4, name: "Vetra" });
    render(<CreateServerModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: " Vetra " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(createMock).toHaveBeenCalledOnce();
    expect(createMock).toHaveBeenCalledWith("Vetra");
  });
});
