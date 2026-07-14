import { useEffect, useRef, useState } from "react";
import type { VetraGif } from "@/api/giphy";
import { giphyApi } from "@/api/giphy";
import type { GifMosaicTile } from "./gifMosaicLayout";

export function ExternalGifTile({ gif, layout, root, onSend, onLoaded, onClick }: { gif: VetraGif; layout: GifMosaicTile; root?: HTMLElement | null; onSend?: () => Promise<void>; onLoaded?: () => void; onClick?: () => void }) {
  const containerRef = useRef<HTMLButtonElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const check = () => {
      const target = element.getBoundingClientRect();
      const bounds = root?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
      const visible = target.bottom >= bounds.top - 240 && target.top <= bounds.bottom + 240 && target.right >= bounds.left && target.left <= bounds.right;
      setEligible(visible);
    };
    check();
    if (typeof IntersectionObserver === "undefined") { setEligible(true); return; }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => setEligible(entry.isIntersecting)), { root, rootMargin: "240px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!eligible || loadedRef.current) return;
    loadedRef.current = true;
    void giphyApi.customerId().then((customerId) => giphyApi.analytics(gif.analytics.onload, customerId));
    onLoaded?.();
  }, [eligible, gif.analytics.onload, onLoaded]);

  useEffect(() => {
    if (!eligible || !videoRef.current) return;
    const video = videoRef.current;
    void video.play().then(() => { setPaused(false); }).catch(() => setPaused(true));
    return () => { video.pause(); setPaused(true); };
  }, [eligible]);

  const handleClick = async () => {
    if (busy || !onSend) return;
    setBusy(true);
    const customerId = await giphyApi.customerId();
    void giphyApi.analytics(gif.analytics.onclick, customerId);
    try {
      await onSend();
      const onsentCustomerId = await giphyApi.customerId();
      void giphyApi.analytics(gif.analytics.onsent, onsentCustomerId);
      setSendError(null);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Unable to send GIF");
    } finally { setBusy(false); }
    onClick?.();
  };

  return <button ref={containerRef} type="button" aria-label={gif.title || "GIF"} disabled={busy} title={sendError || undefined} onClick={() => void handleClick()} className="absolute overflow-hidden rounded bg-muted/40 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" style={{ left: layout.left, top: layout.top, width: layout.width, height: layout.height }}>
    {eligible && (gif.previewMp4Url || gif.messageMp4Url) ? <video ref={videoRef} src={gif.previewMp4Url || gif.messageMp4Url || undefined} poster={gif.previewStillUrl || undefined} muted loop playsInline preload="metadata" className="h-full w-full object-cover" aria-label={gif.title || "GIF"} /> : gif.previewStillUrl ? <img src={gif.previewStillUrl} alt={gif.title || "GIF"} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-muted-foreground">GIF</span>}
    {paused && eligible && <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/45 px-1 text-[10px] text-white">GIF</span>}
  </button>;
}
