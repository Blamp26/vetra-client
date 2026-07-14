import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Settings } from "lucide-react";
import { stickersApi } from "@/api/stickers";
import { API_BASE_URL, postFormData } from "@/api/base";
import { useAppStore } from "@/store";
import type { StickerMessage, StickerPack } from "@/shared/types";
import { StickerStudio, type StickerDestination } from "./StickerStudio";
import { AuthenticatedImage } from "@/shared/components/AuthenticatedImage";

export function StickerPicker({ onSend, onClose }: { onSend: (id: string) => Promise<void>; onClose: () => void }) {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [studio, setStudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUser = useAppStore(state => state.currentUser);
  const ownedPacks = useMemo(() => currentUser ? packs.filter(pack => pack.owner_id === currentUser.id) : [], [currentUser, packs]);
  const saveSession = useRef<{ destinationKey: string; sourceFile?: File; tagsKey: string; packId?: string; mediaId?: string; stickerId?: string }>({ destinationKey: "", tagsKey: "" });

  useEffect(() => {
    stickersApi.list().then(setPacks).catch(() => setError("Unable to load stickers"));
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  useEffect(() => { if (!studio) saveSession.current = { destinationKey: "", tagsKey: "" }; }, [studio]);

  const current = packs[active];
  const stickers = useMemo(() => packs.flatMap(pack => pack.stickers.map(sticker => ({ ...sticker, pack }))).filter(sticker => !query || `${sticker.pack.title} ${sticker.emoji_tags.join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [packs, query]);

  const saveSticker = async (file: File, destination: StickerDestination, tags: string[]) => {
    const destinationKey = destination.kind === "existing" ? `existing:${destination.packId}` : `new:${destination.title}:${destination.visibility}`;
    const tagsKey = tags.join(" ");
    if (saveSession.current.destinationKey !== destinationKey) saveSession.current = { destinationKey, sourceFile: file, tagsKey };
    else {
      if (saveSession.current.sourceFile !== file) { saveSession.current.sourceFile = file; saveSession.current.mediaId = undefined; saveSession.current.stickerId = undefined; }
      if (saveSession.current.tagsKey !== tagsKey) { saveSession.current.tagsKey = tagsKey; saveSession.current.stickerId = undefined; }
    }
    const session = saveSession.current;
    if (!session.packId) session.packId = destination.kind === "existing" ? destination.packId : (await stickersApi.createPack(destination.title, destination.visibility)).id;
    if (!session.mediaId) {
      const form = new FormData(); form.append("file", file); form.append("kind", "photo");
      const response = await postFormData<{ media_file_id?: string; data?: { media_file_id?: string } }>("/media", form);
      session.mediaId = response.data?.media_file_id ?? response.media_file_id;
      if (!session.mediaId) throw new Error("Upload response missing media_file_id");
    }
    if (!session.stickerId) {
      const format = file.type === "image/webp" ? "webp" : "png";
      const sticker = await stickersApi.add(session.packId, { media_file_id: session.mediaId, width: 512, height: 512, format, emoji_tags: tags }) as unknown as StickerMessage;
      if (!sticker?.id) throw new Error("Sticker response missing sticker id");
      session.stickerId = sticker.id;
    }
    const refreshed = await stickersApi.list(); setPacks(refreshed);
    const nextIndex = refreshed.findIndex(pack => pack.id === session.packId); if (nextIndex >= 0) setActive(nextIndex);
    await onSend(session.stickerId);
    saveSession.current = { destinationKey: "", tagsKey: "" };
  };

  return <aside className="sticker-picker flex h-full w-[292px] shrink-0 flex-col border-l border-border bg-card" data-testid="sticker-picker"><div className="flex h-[43px] border-b"><button className="w-1/3 text-sm text-muted-foreground" disabled>Emoji</button><button className="relative w-1/3 text-sm font-medium">Stickers<span className="absolute bottom-0 left-1/2 h-[3px] w-[54px] -translate-x-1/2 rounded bg-primary" /></button><button className="w-1/3 text-sm text-muted-foreground" disabled>GIFs</button></div><div className="flex h-[53px] items-center gap-[6px] px-[14px]"><div className="flex h-[32px] w-[228px] items-center gap-2 rounded bg-muted px-2"><Search className="h-4 w-4" /><input aria-label="Search stickers" className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={event => setQuery(event.target.value)} /></div><button aria-label="Create sticker" title="Create sticker" className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted" onClick={() => setStudio(true)}><Plus className="h-[18px] w-[18px]" /></button></div>{error ? <div className="p-4 text-sm text-destructive">{error}</div> : <><div className="flex h-10 items-center justify-between px-3 text-xs font-medium"><span>{current?.title ?? "Stickers"}</span><button aria-label="Manage sticker packs"><Settings className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-y-auto px-[14px] py-2"><div className="grid grid-cols-4 gap-[6px]">{stickers.map(sticker => <button key={sticker.id} aria-label={`Sticker ${sticker.emoji_tags.join(" ")}`} className="flex h-[62px] w-[62px] items-center justify-center rounded hover:bg-muted focus-visible:outline focus-visible:outline-2" onClick={() => void onSend(sticker.id)}><AuthenticatedImage alt={sticker.emoji_tags.join(" ")} className="max-h-full max-w-full object-contain" src={`${API_BASE_URL}/media/${sticker.media_file_id}`} /></button>)}</div>{!stickers.length && <p className="py-8 text-center text-sm text-muted-foreground">{packs.length ? "No stickers found" : "No sticker packs"}</p>}</div><div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-t px-2"><button aria-label="Manage sticker packs" className="flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-muted"><Settings className="h-4 w-4" /></button>{packs.map((pack, index) => { const cover = pack.stickers[0]; return <button key={pack.id} aria-label={pack.title} className={`h-8 w-8 shrink-0 rounded p-0.5 ${index === active ? "bg-primary/20" : ""}`} onClick={() => { setActive(index); setQuery(""); }}>{cover && <AuthenticatedImage alt={pack.title} className="h-full w-full object-contain" src={`${API_BASE_URL}/media/${cover.media_file_id}`} />}</button>; })}</div></>}{studio && <StickerStudio packs={ownedPacks} onClose={() => setStudio(false)} onSave={saveSticker} />}</aside>;
}
