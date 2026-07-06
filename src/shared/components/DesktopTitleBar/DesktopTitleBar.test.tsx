import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopTitleBar } from "./DesktopTitleBar";

const {
  mockWindowApi,
  getCurrentWindowMock,
} = vi.hoisted(() => {
  const mockWindowApi = {
    minimize: vi.fn().mockResolvedValue(undefined),
    maximize: vi.fn().mockResolvedValue(undefined),
    unmaximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isMaximized: vi.fn().mockResolvedValue(false),
  };

  return {
    mockWindowApi,
    getCurrentWindowMock: vi.fn(() => mockWindowApi),
  };
});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: getCurrentWindowMock,
}));

describe("DesktopTitleBar", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("renders only in Tauri", async () => {
    render(<DesktopTitleBar />);

    expect(screen.getByTestId("desktop-title-bar")).toBeInTheDocument();
    await waitFor(() => {
      expect(getCurrentWindowMock).toHaveBeenCalledTimes(1);
    });
  });

  it("does not render in a normal browser runtime", () => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");

    render(<DesktopTitleBar />);

    expect(screen.queryByTestId("desktop-title-bar")).not.toBeInTheDocument();
  });

  it("invokes Tauri window controls", async () => {
    render(<DesktopTitleBar />);

    await waitFor(() => {
      expect(getCurrentWindowMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Minimize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));

    await waitFor(() => {
      expect(mockWindowApi.minimize).toHaveBeenCalledTimes(1);
      expect(mockWindowApi.maximize).toHaveBeenCalledTimes(1);
      expect(mockWindowApi.close).toHaveBeenCalledTimes(1);
    });
  });
});
