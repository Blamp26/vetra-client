import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
}));

import { AuthenticatedImage } from "./AuthenticatedImage";

class IdleIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

class ImmediateIntersectionObserver {
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never);
  }

  disconnect() {}
  unobserve() {}
}

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("AuthenticatedImage", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ authToken: "secret-token" }),
    );
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.restoreAllMocks();
  });

  it("keeps the loading placeholder sized to fill its parent", () => {
    vi.stubGlobal("IntersectionObserver", IdleIntersectionObserver);

    const { container } = render(
      <AuthenticatedImage
        src="/api/v1/media/photo-1"
        alt="Preview"
        className="h-full w-full object-cover rounded-[12px]"
        style={{ borderRadius: "12px" }}
      />,
    );

    const placeholder = container.firstChild as HTMLElement;
    expect(placeholder.tagName).toBe("DIV");
    expect(placeholder).toHaveClass("h-full", "w-full", "object-cover", "rounded-[12px]", "bg-muted", "animate-pulse");
    expect(placeholder).toHaveStyle({
      display: "block",
      width: "100%",
      height: "100%",
      borderRadius: "12px",
    });
  });

  it("renders a loaded image that still fills the tile and reports diagnostics", async () => {
    vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["image-bytes"], { type: "image/jpeg" }),
    } as Response);
    const revokeMock = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const diagnosticsSpy = vi.fn();

    render(
      <AuthenticatedImage
        src="/api/v1/media/photo-2"
        alt="Loaded preview"
        className="h-full w-full object-cover rounded-[12px]"
        onMediaDiagnostics={diagnosticsSpy}
      />,
    );

    await waitFor(() => expect(screen.getByAltText("Loaded preview")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/media/photo-2", {
      headers: { Authorization: "Bearer secret-token" },
    });

    const image = screen.getByAltText("Loaded preview");
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 900 },
      clientWidth: { configurable: true, value: 320 },
      clientHeight: { configurable: true, value: 180 },
    });

    fireEvent.load(image);

    expect(image).toHaveClass("h-full", "w-full", "object-cover", "rounded-[12px]");
    expect(image).toHaveStyle({
      display: "block",
      width: "100%",
      height: "100%",
    });
    expect(diagnosticsSpy).toHaveBeenCalledWith(expect.objectContaining({
      naturalWidth: 1600,
      naturalHeight: 900,
      renderedWidth: 320,
      renderedHeight: 180,
    }));

    const { unmount } = render(<AuthenticatedImage src="/api/v1/media/photo-3" alt="Second preview" />);
    await waitFor(() => expect(screen.getByAltText("Second preview")).toBeInTheDocument());
    unmount();
    expect(revokeMock).toHaveBeenCalledWith("blob:preview");
  });
});
