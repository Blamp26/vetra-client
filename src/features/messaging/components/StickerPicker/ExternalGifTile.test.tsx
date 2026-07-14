import "@testing-library/jest-dom/vitest";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { VetraGif } from "@/api/giphy";

const { customerIdMock, analyticsMock } = vi.hoisted(() => ({
  customerIdMock: vi.fn(),
  analyticsMock: vi.fn(),
}));

vi.mock("@/api/giphy", () => ({
  giphyApi: {
    customerId: customerIdMock,
    analytics: analyticsMock,
  },
}));

import { ExternalGifTile } from "./ExternalGifTile";

const gif: VetraGif = {
  provider: "giphy",
  providerId: "gif-1",
  title: "Cat",
  width: 480,
  height: 270,
  previewMp4Url: "https://media.giphy.com/cat.mp4",
  previewWebpUrl: null,
  previewStillUrl: "https://media.giphy.com/cat.jpg",
  messageMp4Url: null,
  messageWebpUrl: null,
  analytics: { onload: "https://analytics/load" },
};

type ObserverInstance = {
  options: IntersectionObserverInit;
  callback: IntersectionObserverCallback;
  trigger: (isIntersecting: boolean, intersectionRatio?: number) => void;
};

describe("ExternalGifTile media lifecycle", () => {
  let observers: ObserverInstance[];
  let rectangles: WeakMap<Element, DOMRect>;
  let observerClass: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    observers = [];
    rectangles = new WeakMap();
    customerIdMock.mockResolvedValue("customer");
    analyticsMock.mockResolvedValue(undefined);
    observerClass = vi.fn(function (this: ObserverInstance & { observe: () => void; disconnect: () => void }, callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
      this.options = options;
      this.callback = callback;
      this.observe = vi.fn();
      this.disconnect = vi.fn();
      this.trigger = (isIntersecting, intersectionRatio = isIntersecting ? 1 : 0) => callback([{ isIntersecting, intersectionRatio } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      observers.push(this);
    });
    vi.stubGlobal("IntersectionObserver", observerClass);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return rectangles.get(this) ?? new DOMRect(0, 400, 100, 100);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preloads near-visible media, plays only in the viewport, and keeps one video mounted", async () => {
    const root = document.createElement("div");
    rectangles.set(root, new DOMRect(0, 0, 292, 300));
    const send = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<ExternalGifTile gif={gif} layout={{ providerId: gif.providerId, left: 0, top: 400, width: 96, height: 100 }} root={root} onSend={send} />, { container: root });

    const tile = container.querySelector("button")!;
    rectangles.set(tile, new DOMRect(0, 400, 96, 100));
    await act(async () => undefined);
    await waitFor(() => expect(tile.querySelector("video")).toBeTruthy());
    const video = tile.querySelector("video")!;
    expect(video).toBeTruthy();
    expect(video).not.toHaveAttribute("autoplay");
    let paused = true;
    const play = vi.fn(() => { paused = false; return Promise.resolve(); });
    const pause = vi.fn(() => { paused = true; });
    Object.defineProperty(video, "play", { configurable: true, value: play });
    Object.defineProperty(video, "pause", { configurable: true, value: pause });
    Object.defineProperty(video, "paused", { configurable: true, get: () => paused });

    const loadObserver = observers.find((observer) => observer.options.rootMargin === "240px");
    const playObserver = observers.find((observer) => observer.options.rootMargin === "0px");
    expect(loadObserver).toBeDefined();
    expect(playObserver).toBeDefined();
    expect(play).not.toHaveBeenCalled();

    rectangles.set(tile, new DOMRect(0, 100, 96, 100));
    act(() => playObserver!.trigger(true, 1));
    await act(async () => undefined);
    expect(play).toHaveBeenCalledTimes(1);
    const firstVideo = tile.querySelector("video");

    act(() => playObserver!.trigger(false, 0));
    await act(async () => undefined);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(tile.querySelector("video")).toBe(firstVideo);

    act(() => playObserver!.trigger(true, 1));
    await act(async () => undefined);
    expect(play).toHaveBeenCalledTimes(2);
    expect(tile.querySelector("video")).toBe(firstVideo);
    expect(analyticsMock).toHaveBeenCalledTimes(1);
  });

  it("renders the message WebP fallback when a preview rendition is absent", async () => {
    const root = document.createElement("div");
    rectangles.set(root, new DOMRect(0, 0, 292, 300));
    const fallbackGif = { ...gif, previewMp4Url: null, messageMp4Url: null, previewWebpUrl: null, messageWebpUrl: "https://media.giphy.com/cat.webp" };
    const { container } = render(<ExternalGifTile gif={fallbackGif} layout={{ providerId: gif.providerId, left: 0, top: 0, width: 96, height: 100 }} root={root} />, { container: root });

    await waitFor(() => expect(container.querySelector("img")).toBeTruthy());
    expect(container.querySelector("img")).toHaveAttribute("src", fallbackGif.messageWebpUrl);
  });
});
