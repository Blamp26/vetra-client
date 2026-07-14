import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { StickerPack } from "@/shared/types";
import { ApiError } from "@/api/base";

export type StickerDestination = { kind: "existing"; packId: string };
export type PreparedSticker =
  | { kind: "static"; file: File; width: 512; height: 512; format: "webp" | "png"; uploadKind: "photo" }
  | { kind: "video"; file: File; width: number; height: number; format: "webm"; uploadKind: "video"; durationMs: number };
export type ExportedSticker = Extract<PreparedSticker, { kind: "static" }>;
type Props = { pack: StickerPack; onClose: () => void; onSave: (prepared: PreparedSticker, destination: StickerDestination, tags: string[]) => Promise<void> };

export async function exportStickerFile(source: File): Promise<ExportedSticker> {
  const sourceUrl = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error("Could not read image")); element.src = sourceUrl; });
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Sticker export is unavailable");
    context.clearRect(0, 0, 512, 512); const scale = Math.min(512 / image.naturalWidth, 512 / image.naturalHeight); const width = image.naturalWidth * scale; const height = image.naturalHeight * scale;
    context.drawImage(image, (512 - width) / 2, (512 - height) / 2, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92)); const format = blob ? "webp" : "png";
    const output = blob ?? await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png")); if (!output) throw new Error("Could not export sticker image");
    const base = source.name.replace(/\.[^.]+$/, "") || "sticker";
    return { kind: "static", file: new File([output], `${base}.${format}`, { type: `image/${format}` }), width: 512, height: 512, format, uploadKind: "photo" };
  } finally { URL.revokeObjectURL(sourceUrl); }
}

const isWebm = (file: File) => file.type === "video/webm" || (!file.type && /\.webm$/i.test(file.name));

export function StickerStudio({ pack, onClose, onSave }: Props) {
  const input = useRef<HTMLInputElement>(null); const selectionRef = useRef(0);
  const [file, setFile] = useState<File | null>(null); const [previewUrl, setPreviewUrl] = useState<string | null>(null); const [exported, setExported] = useState<ExportedSticker | null>(null); const [preparedVideo, setPreparedVideo] = useState<PreparedSticker | null>(null);
  const [tags, setTags] = useState("😀"); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    setExported(null); setPreparedVideo(null); if (!file || !isWebm(file)) return;
    const identity = ++selectionRef.current; const url = URL.createObjectURL(file); const video = document.createElement("video"); video.preload = "metadata";
    const fail = (message: string) => { if (identity === selectionRef.current) setError(message); URL.revokeObjectURL(url); };
    video.onloadedmetadata = () => { if (identity !== selectionRef.current) return void URL.revokeObjectURL(url); const { videoWidth: width, videoHeight: height, duration } = video;
      if (!Number.isFinite(duration) || duration <= 0) return fail("WEBM video is unreadable"); if (duration > 3) return fail("WEBM stickers must be 3 seconds or shorter");
      if (file.size > 256 * 1024) return fail("WEBM stickers must be 256 KiB or smaller");
      if (!((width === 512 && height > 0 && height <= 512) || (height === 512 && width > 0 && width <= 512))) return fail("WEBM stickers must have one side exactly 512px and the other no more than 512px");
      setError(null); setPreparedVideo({ kind: "video", file, width, height, format: "webm", uploadKind: "video", durationMs: Math.round(duration * 1000) }); URL.revokeObjectURL(url);
    }; video.onerror = () => fail("WEBM video is unreadable"); video.src = url;
    return () => { selectionRef.current++; video.onloadedmetadata = null; video.onerror = null; URL.revokeObjectURL(url); };
  }, [file]);

  const choose = (candidate?: File) => { if (!candidate) return; const webm = isWebm(candidate); if (!webm && !["image/png", "image/webp", "image/jpeg"].includes(candidate.type)) return void setError("Choose a PNG, WebP, JPEG, or WEBM sticker"); if (webm && candidate.size > 256 * 1024) return void setError("WEBM stickers must be 256 KiB or smaller"); if (!webm && candidate.size > 10 * 1024 * 1024) return void setError("Image must be 10 MB or smaller"); setError(null); setFile(candidate); setPreviewUrl(previous => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(candidate); }); };
  const submit = async () => { if (!file || !pack.id) return; setBusy(true); setError(null); try { const prepared = isWebm(file) ? preparedVideo : (exported ?? await exportStickerFile(file)); if (!prepared) throw new Error("WEBM metadata is not ready"); if (!isWebm(file)) setExported(prepared as ExportedSticker); await onSave(prepared, { kind: "existing", packId: pack.id }, tags.trim().split(/\s+/).filter(Boolean)); onClose(); } catch (cause) { if (cause instanceof ApiError && cause.details) { const first = Object.entries(cause.details).flatMap(([field, messages]) => messages.map(message => `${field}: ${message}`))[0]; setError(first ?? cause.message); } else setError(cause instanceof Error ? cause.message : "Could not save sticker. Try again."); } finally { setBusy(false); } };
  const webm = Boolean(file && isWebm(file));
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" role="dialog" aria-modal="true" aria-label="Sticker Studio"><div className="w-[760px] max-w-full rounded-xl bg-card p-5 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Sticker Studio</h2><button aria-label="Close" onClick={onClose} disabled={busy}><X className="h-5 w-5" /></button></div><div className="mt-5 grid grid-cols-[1fr_240px] gap-6"><div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); choose(event.dataTransfer.files[0]); }} className="flex h-[512px] items-center justify-center rounded-lg border border-dashed border-border bg-[linear-gradient(45deg,#eee_25%,transparent_25%),linear-gradient(-45deg,#eee_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee_75%),linear-gradient(-45deg,transparent_75%,#eee_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0px]">{previewUrl ? (webm ? <video src={previewUrl} muted loop autoPlay playsInline controls={false} className="max-h-full max-w-full object-contain" /> : <img src={previewUrl} alt="Sticker preview" className="max-h-full max-w-full object-contain" />) : <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => input.current?.click()}>Choose or drop sticker</button>}<input ref={input} type="file" hidden accept="image/png,image/webp,image/jpeg,video/webm,.webm" onChange={event => choose(event.target.files?.[0])} /></div><div className="space-y-4"><div className="rounded border border-border p-3"><p className="text-xs text-muted-foreground">Pack</p><p className="mt-1 truncate text-sm font-medium" title={pack.title}>{pack.title}</p></div>{file && <p className="truncate text-xs text-muted-foreground">{file.name}</p>}{webm && <p className="text-xs text-muted-foreground">Animated WEBM stickers are uploaded without editing.</p>}<label className="block text-sm">Emoji tags<input aria-label="Emoji tags" className="mt-1 w-full rounded border bg-transparent p-2" value={tags} onChange={event => setTags(event.target.value)} /></label>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}<button disabled={!file || busy || (webm && !preparedVideo)} className="w-full rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" onClick={() => void submit()}>{busy ? "Saving sticker…" : "Save and send"}</button></div></div></div></div>;
}
