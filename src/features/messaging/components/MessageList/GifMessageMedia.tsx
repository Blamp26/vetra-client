import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMediaVisibility } from "@/shared/components/MediaVisibilityContext";
import type { GifMessage } from "@/shared/types";
import { useGifResolver } from "./GifResolverContext";

export function GifMessageMedia({ gif, onClick, selectionMode = false, mediaOnlyMetadata }: { gif: GifMessage; onClick?: () => void; selectionMode?: boolean; mediaOnlyMetadata?: ReactNode }) {
  const { root, revision } = useMediaVisibility();
  const { gifs, register } = useGifResolver();
  const ref = useRef<HTMLButtonElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [eligible, setEligible] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const resolved = gifs[gif.provider_id];
  const ratio = gif.width / Math.max(1, gif.height);
  const width = Math.min(480, Math.max(120, Math.round(Math.min(480, gif.width))));
  const height = Math.min(432, Math.max(90, Math.round(width / Math.max(0.5, Math.min(2.5, ratio)))));

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const check = () => { const rect = element.getBoundingClientRect(); const bounds = root?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }; setEligible(rect.bottom >= bounds.top - 240 && rect.top <= bounds.bottom + 240 && rect.right >= bounds.left && rect.left <= bounds.right); };
    check();
    if (typeof IntersectionObserver === "undefined") { setEligible(true); return; }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => setEligible(entry.isIntersecting)), { root, rootMargin: "240px" });
    observer.observe(element); return () => observer.disconnect();
  }, [root, revision]);

  useEffect(() => { if (eligible) register(gif.provider_id); }, [eligible, gif.provider_id, register]);
  useEffect(() => { const video = videoRef.current; if (!video || !eligible || manualPaused || !resolved?.messageMp4Url) return; void video.play().catch(() => undefined); return () => video.pause(); }, [eligible, manualPaused, resolved?.messageMp4Url]);

  const toggle = () => { if (!resolved) return; const video = videoRef.current; if (video) { if (video.paused) { setManualPaused(false); void video.play(); } else { video.pause(); setManualPaused(true); } } onClick?.(); };
  return <button ref={ref} type="button" data-testid="gif-message-media" data-gif-visual-anchor aria-label="GIF" onClick={(event) => { if (selectionMode) return; event.stopPropagation(); toggle(); }} className="relative block overflow-hidden rounded-[15px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" style={{ width, height }}>
    {resolved?.messageMp4Url ? <video ref={videoRef} src={resolved.messageMp4Url} poster={resolved.previewStillUrl || undefined} muted loop playsInline preload="metadata" className="h-full w-full object-cover" /> : resolved?.messageWebpUrl ? <img src={resolved.messageWebpUrl} alt={resolved.title || "GIF"} className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">GIF</span>}
    {mediaOnlyMetadata}
  </button>;
}
