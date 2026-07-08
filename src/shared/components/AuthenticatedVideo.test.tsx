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

import { AuthenticatedVideo } from "./AuthenticatedVideo";

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

describe("AuthenticatedVideo", () => {
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
      <AuthenticatedVideo
        src="/api/v1/media/video-1"
        className="h-full w-full object-cover rounded-[12px]"
        style={{ borderRadius: "12px" }}
      />,
    );

    const placeholder = container.firstChild as HTMLElement;
    expect(placeholder.tagName).toBe("DIV");
    expect(placeholder).toHaveClass("h-full", "w-full", "object-cover", "rounded-[12px]", "bg-muted/50", "animate-pulse");
    expect(placeholder).toHaveStyle({
      display: "block",
      width: "100%",
      height: "100%",
      borderRadius: "12px",
    });
  });

  it("fetches with auth, creates an object URL, renders a video, and reports metadata", async () => {
    vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:video-preview");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["video-bytes"], { type: "video/mp4" }),
    } as Response);

    const diagnosticsSpy = vi.fn();

    render(
      <AuthenticatedVideo
        src="/api/v1/media/video-2"
        data-testid="authenticated-video"
        className="h-full w-full object-cover"
        onMediaDiagnostics={diagnosticsSpy}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("authenticated-video")).toBeInTheDocument());

    expect(fetch).toHaveBeenCalledWith("/api/v1/media/video-2", {
      headers: { Authorization: "Bearer secret-token" },
    });
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);

    const video = screen.getByTestId("authenticated-video");
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
      clientWidth: { configurable: true, value: 320 },
      clientHeight: { configurable: true, value: 180 },
      duration: { configurable: true, value: 42 },
    });

    fireEvent(video, new Event("loadedmetadata"));

    expect(video).toHaveClass("h-full", "w-full", "object-cover");
    expect(video).toHaveStyle({
      display: "block",
      width: "100%",
      height: "100%",
    });
    expect(video).toHaveAttribute("src", "blob:video-preview");
    expect(diagnosticsSpy).toHaveBeenCalledWith(expect.objectContaining({
      naturalWidth: 1280,
      naturalHeight: 720,
      renderedWidth: 320,
      renderedHeight: 180,
      duration: 42,
    }));
  });

  it("shows a fallback on fetch error", async () => {
    vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <AuthenticatedVideo
        src="/api/v1/media/video-error"
        data-testid="authenticated-video"
        className="h-full w-full"
      />,
    );

    await waitFor(() => expect(screen.queryByTestId("authenticated-video")).not.toBeInTheDocument());
    expect(container.firstChild).toBeInstanceOf(HTMLDivElement);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("revokes the object URL on unmount", async () => {
    vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:video-ok");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["video-bytes"], { type: "video/mp4" }),
    } as Response);

    const { unmount } = render(
      <AuthenticatedVideo
        src="/api/v1/media/video-ok"
        data-testid="authenticated-video"
        className="h-full w-full"
      />,
    );

    await waitFor(() => expect(screen.getByTestId("authenticated-video")).toBeInTheDocument());
    unmount();

    expect(revokeSpy).toHaveBeenCalledWith("blob:video-ok");
  });
});
