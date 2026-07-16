import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_TITLE_BAR_HEIGHT, DesktopTitleBar } from "./DesktopTitleBar";

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
    expect(screen.getByTestId("desktop-title-bar")).toHaveStyle({ height: `${APP_TITLE_BAR_HEIGHT}px` });
    expect(screen.getByText("Vetra")).toBeInTheDocument();
    expect(screen.queryByText("Desktop")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(getCurrentWindowMock).toHaveBeenCalledTimes(1);
    });
  });

  it("does not render in a normal browser runtime", () => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");

    render(<DesktopTitleBar />);

    expect(screen.queryByTestId("desktop-title-bar")).not.toBeInTheDocument();
  });

  it("clicking minimize calls the Tauri minimize API", async () => {
    render(<DesktopTitleBar />);

    await waitFor(() => {
      expect(getCurrentWindowMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Minimize window" }));

    await waitFor(() => {
      expect(mockWindowApi.minimize).toHaveBeenCalledTimes(1);
    });
  });

  it("clicking maximize calls maximize when the window is not maximized", async () => {
    mockWindowApi.isMaximized.mockResolvedValueOnce(false);
    render(<DesktopTitleBar />);

    await waitFor(() => {
      expect(getCurrentWindowMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Maximize window" }));

    await waitFor(() => {
      expect(mockWindowApi.maximize).toHaveBeenCalledTimes(1);
      expect(mockWindowApi.unmaximize).not.toHaveBeenCalled();
    });
  });

  it("clicking restore calls unmaximize when the window is already maximized", async () => {
    mockWindowApi.isMaximized.mockResolvedValueOnce(true);
    render(<DesktopTitleBar />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Restore window" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Restore window" }));

    await waitFor(() => {
      expect(mockWindowApi.unmaximize).toHaveBeenCalledTimes(1);
      expect(mockWindowApi.maximize).not.toHaveBeenCalled();
    });
  });

  it("clicking close calls the Tauri close API", async () => {
    render(<DesktopTitleBar />);

    await waitFor(() => {
      expect(getCurrentWindowMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Close window" }));

    await waitFor(() => {
      expect(mockWindowApi.close).toHaveBeenCalledTimes(1);
    });
  });

  it("window control clicks do not bubble past the title bar", async () => {
    const parentClick = vi.fn();

    render(
      <div onClick={parentClick}>
        <DesktopTitleBar />
      </div>,
    );

    await waitFor(() => {
      expect(getCurrentWindowMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Minimize window" }));

    expect(parentClick).not.toHaveBeenCalled();
  });

  it("keeps the flexible title area as the Tauri drag region", () => {
    const { container } = render(<DesktopTitleBar />);

    const dragRegions = Array.from(container.querySelectorAll("[data-tauri-drag-region]"));
    const flexibleRegion = dragRegions.find((element) => element.classList.contains("flex-1"));

    expect(flexibleRegion).toBeInTheDocument();
    expect(flexibleRegion).toHaveAttribute("data-tauri-drag-region");
    expect(screen.getByText("Vetra")).toHaveAttribute("data-tauri-drag-region");
  });

  it("keeps window controls outside all Tauri drag regions", () => {
    render(<DesktopTitleBar />);

    for (const label of ["Minimize window", "Maximize window", "Close window"]) {
      const button = screen.getByRole("button", { name: label });
      expect(button).not.toHaveAttribute("data-tauri-drag-region");
      expect(button.closest("[data-tauri-drag-region]")).toBeNull();
    }
  });

  it("declares the Tauri permission required for native title-bar dragging", () => {
    const capability = JSON.parse(
      readFileSync(resolve(process.cwd(), "src-tauri/capabilities/default.json"), "utf8"),
    ) as { permissions: string[] };

    expect(capability.permissions).toContain("core:window:allow-start-dragging");
  });
});
