import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Settings } from "lucide-react";
import { stickersApi } from "@/api/stickers";
import { API_BASE_URL, postFormData } from "@/api/base";
import type { StickerPack } from "@/shared/types";
import { StickerStudio } from "./StickerStudio";

export function StickerPicker({ onSend, onClose }: { onSend: (id: string) => Promise<void>; onClose: () => void }) {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [studio, setStudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { stickersApi.list().then(setPacks).catch(() => setError("Unable to load stickers")); const close = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose]);
  const current = packs[active];
  const stickers = useMemo(() => packs.flatMap(p => p.stickers.map(s => ({ ...s, pack: p }))).filter(s => !query || `${s.pack.title} ${s.emoji_tags.join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [packs, query]);
  const saveSticker = async (file: File, packId: string, tags: string[]) => {
    const form = new FormData(); form.append("file", file); form.append("kind", "photo");
    const uploaded = await postFormData<{ id: string }>("/media", form);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const url = URL.createObjectURL(file); const value = new Image(); value.onload = () => { URL.revokeObjectURL(url); resolve(value); }; value.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Invalid image")); }; value.src = url; });
    const sticker = await stickersApi.add(packId, { media_file_id: uploaded.id, width: image.naturalWidth, height: image.naturalHeight, format: file.type === "image/webp" ? "webp" : "png", emoji_tags: tags });
    setPacks(await stickersApi.list()); await onSend((sticker as unknown as { id: string }).id);
  };
  return <aside className="sticker-picker flex h-full w-[292px] shrink-0 flex-col border-l border-border bg-card" data-testid="sticker-picker"><div className="flex h-[43px] border-b"><button className="w-1/3 text-sm text-muted-foreground" disabled>Emoji</button><button className="relative w-1/3 text-sm font-medium">Stickers<span className="absolute bottom-0 left-1/2 h-[3px] w-[54px] -translate-x-1/2 rounded bg-primary" /></button><button className="w-1/3 text-sm text-muted-foreground" disabled>GIFs</button></div><div className="flex h-[53px] items-center gap-[6px] px-[14px]"><div className="flex h-[32px] w-[228px] items-center gap-2 rounded bg-muted px-2"><Search className="h-4 w-4" /><input aria-label="Search stickers" className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={e => setQuery(e.target.value)} /></div><button aria-label="Create sticker" title="Create sticker" className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted" onClick={() => setStudio(true)}><Plus className="h-[18px] w-[18px]" /></button></div>{error ? <div className="p-4 text-sm text-destructive">{error}</div> : <><div className="flex h-10 items-center justify-between px-3 text-xs font-medium"><span>{current?.title ?? "Stickers"}</span><button aria-label="Manage sticker packs"><Settings className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-y-auto px-[14px] py-2"><div className="grid grid-cols-4 gap-[6px]">{stickers.map(s => <button key={s.id} aria-label={`Sticker ${s.emoji_tags.join(" ")}`} className="flex h-[62px] w-[62px] items-center justify-center rounded hover:bg-muted focus-visible:outline focus-visible:outline-2" onClick={() => void onSend(s.id)}><img className="max-h-full max-w-full object-contain" src={`${API_BASE_URL}/media/${s.media_file_id}`} /></button>)}</div>{!stickers.length && <p className="py-8 text-center text-sm text-muted-foreground">{packs.length ? "No stickers found" : "No sticker packs"}</p>}</div><div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-t px-2"><button aria-label="Manage sticker packs" className="flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-muted"><Settings className="h-4 w-4" /></button>{packs.map((p, i) => <button key={p.id} aria-label={p.title} className={`h-8 w-8 shrink-0 rounded p-0.5 ${i === active ? "bg-primary/20" : ""}`} onClick={() => { setActive(i); setQuery(""); }}><img className="h-full w-full object-contain" src={p.stickers[0] ? `${API_BASE_URL}/media/${p.stickers[0].media_file_id}` : ""} /></button>)}</div></>}{studio && <StickerStudio packs={packs.filter(p => p.owner_id > 0)} onClose={() => setStudio(false)} onSave={saveSticker} />}</aside>;
}
