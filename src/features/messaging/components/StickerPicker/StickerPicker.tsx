import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Settings, X } from "lucide-react";
import { stickersApi } from "@/api/stickers";
import { API_BASE_URL, postFormData } from "@/api/base";
import { useAppStore } from "@/store";
import type { StickerMessage, StickerPack } from "@/shared/types";
import { StickerStudio, type StickerDestination } from "./StickerStudio";
import { AuthenticatedImage } from "@/shared/components/AuthenticatedImage";

type PackVisibility = "private" | "unlisted" | "public";

function CreateStickerPackDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (title: string, visibility: PackVisibility) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<PackVisibility>("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedTitle = title.trim();
  const titleError = !trimmedTitle ? "Pack title is required" : trimmedTitle.length > 128 ? "Pack title must be 128 characters or fewer" : null;

  const submit = async () => {
    if (titleError || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreated(trimmedTitle, visibility);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create sticker pack. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" role="dialog" aria-modal="true" aria-label="Create sticker pack"><div className="w-[420px] max-w-full rounded-xl bg-card p-5 shadow-xl">
    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Create sticker pack</h2><button type="button" aria-label="Close" onClick={onClose} disabled={busy}><X className="h-5 w-5" /></button></div>
    <div className="mt-5 space-y-4"><label className="block text-sm font-medium">Pack title<input autoFocus aria-label="Pack title" className="mt-1 w-full rounded border bg-transparent p-2" value={title} onChange={(event) => setTitle(event.target.value)} />{titleError && <span className="mt-1 block text-xs text-destructive">{titleError}</span>}</label><label className="block text-sm font-medium">Visibility<select aria-label="Visibility" className="mt-1 w-full rounded border bg-transparent p-2" value={visibility} onChange={(event) => setVisibility(event.target.value as PackVisibility)}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="rounded px-3 py-2 text-sm hover:bg-muted" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={() => void submit()} disabled={Boolean(titleError) || busy}>{busy ? "Creating pack…" : "Create pack"}</button></div></div>
  </div></div>;
}

export function StickerPicker({ onSend, onClose }: { onSend: (id: string) => Promise<void>; onClose: () => void }) {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [packDialogOpen, setPackDialogOpen] = useState(false);
  const [studioPack, setStudioPack] = useState<StickerPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentUser = useAppStore((state) => state.currentUser);
  const saveSession = useRef<{ destinationKey: string; sourceFile?: File; tagsKey: string; packId?: string; mediaId?: string; stickerId?: string }>({ destinationKey: "", tagsKey: "" });

  useEffect(() => {
    let cancelled = false;
    stickersApi.list().then((loaded) => {
      if (cancelled) return;
      setPacks(loaded);
      setActivePackId((previous) => previous && loaded.some((pack) => pack.id === previous) ? previous : loaded[0]?.id ?? null);
    }).catch(() => {
      if (!cancelled) setError("Unable to load stickers");
    });
    return () => {
      cancelled = true;
    };
  }, [onClose]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (studioPack) setStudioPack(null);
      else if (packDialogOpen) setPackDialogOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, packDialogOpen, studioPack]);

  useEffect(() => {
    if (!studioPack) saveSession.current = { destinationKey: "", tagsKey: "" };
  }, [studioPack]);

  const refreshPacks = async (preferredId?: string) => {
    const refreshed = await stickersApi.list();
    setPacks(refreshed);
    setActivePackId((previous) => {
      const candidate = preferredId ?? previous;
      return candidate && refreshed.some((pack) => pack.id === candidate) ? candidate : refreshed[0]?.id ?? null;
    });
    return refreshed;
  };

  const currentPack = packs.find((pack) => pack.id === activePackId) ?? packs[0] ?? null;
  const currentPackIsOwned = Boolean(currentPack && currentUser && currentPack.owner_id === currentUser.id);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchResults = useMemo(() => packs.flatMap((pack) => pack.stickers.map((sticker) => ({ ...sticker, pack }))).filter((sticker) => !normalizedQuery || `${sticker.pack.title} ${sticker.emoji_tags.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery)), [packs, normalizedQuery]);
  const visibleStickers = normalizedQuery ? searchResults : currentPack?.stickers ?? [];

  const createPack = async (title: string, visibility: PackVisibility) => {
    const created = await stickersApi.createPack(title, visibility);
    if (!created?.id) throw new Error("Pack response missing pack id");
    await refreshPacks(created.id);
    setQuery("");
    setPackDialogOpen(false);
  };

  const saveSticker = async (file: File, destination: StickerDestination, tags: string[]) => {
    const destinationKey = `existing:${destination.packId}`;
    const tagsKey = tags.join(" ");
    if (saveSession.current.destinationKey !== destinationKey) saveSession.current = { destinationKey, sourceFile: file, tagsKey, packId: destination.packId };
    else {
      if (saveSession.current.sourceFile !== file) { saveSession.current.sourceFile = file; saveSession.current.mediaId = undefined; saveSession.current.stickerId = undefined; }
      if (saveSession.current.tagsKey !== tagsKey) { saveSession.current.tagsKey = tagsKey; saveSession.current.stickerId = undefined; }
    }
    const session = saveSession.current;
    if (!session.mediaId) {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "photo");
      const response = await postFormData<{ media_file_id?: string; data?: { media_file_id?: string } }>("/media", form);
      session.mediaId = response.data?.media_file_id ?? response.media_file_id;
      if (!session.mediaId) throw new Error("Upload response missing media_file_id");
    }
    if (!session.stickerId) {
      const format = file.type === "image/webp" ? "webp" : "png";
      const sticker = await stickersApi.add(session.packId!, { media_file_id: session.mediaId, width: 512, height: 512, format, emoji_tags: tags }) as unknown as StickerMessage;
      if (!sticker?.id) throw new Error("Sticker response missing sticker id");
      session.stickerId = sticker.id;
    }
    await refreshPacks(session.packId);
    await onSend(session.stickerId);
    saveSession.current = { destinationKey: "", tagsKey: "" };
  };

  return <aside className="sticker-picker flex h-full w-[292px] shrink-0 flex-col border-l border-border bg-card" data-testid="sticker-picker"><div className="flex h-[43px] border-b"><button className="w-1/3 text-sm text-muted-foreground" disabled>Emoji</button><button className="relative w-1/3 text-sm font-medium">Stickers<span className="absolute bottom-0 left-1/2 h-[3px] w-[54px] -translate-x-1/2 rounded bg-primary" /></button><button className="w-1/3 text-sm text-muted-foreground" disabled>GIFs</button></div><div className="flex h-[53px] items-center gap-[6px] px-[14px]"><div className="flex h-[32px] w-[228px] items-center gap-2 rounded bg-muted px-2"><Search className="h-4 w-4" /><input aria-label="Search stickers" className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} /></div><button aria-label="Create sticker pack" title="Create sticker pack" className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted" onClick={() => setPackDialogOpen(true)}><Plus className="h-[18px] w-[18px]" /></button></div>{error ? <div className="p-4 text-sm text-destructive">{error}</div> : <><div className="flex h-10 items-center justify-between px-3 text-xs font-medium"><span>{currentPack?.title ?? "Stickers"}</span><button aria-label="Manage sticker packs"><Settings className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-y-auto px-[14px] py-2"><div className="grid grid-cols-4 gap-[6px]">{!normalizedQuery && currentPackIsOwned && <button type="button" aria-label={`Add sticker to ${currentPack?.title}`} title="Create sticker" className="flex h-[62px] w-[62px] items-center justify-center rounded bg-muted/60 hover:bg-muted focus-visible:outline focus-visible:outline-2" onClick={() => currentPack && setStudioPack(currentPack)}><Plus className="h-6 w-6" /></button>}{visibleStickers.map((sticker) => <button type="button" key={sticker.id} aria-label={`Sticker ${sticker.emoji_tags.join(" ")}`} className="flex h-[62px] w-[62px] items-center justify-center rounded hover:bg-muted focus-visible:outline focus-visible:outline-2" onClick={() => void onSend(sticker.id)}><AuthenticatedImage alt={sticker.emoji_tags.join(" ")} className="max-h-full max-w-full object-contain" src={`${API_BASE_URL}/media/${sticker.media_file_id}`} /></button>)}</div>{!visibleStickers.length && !(currentPackIsOwned && !normalizedQuery) && <p className="py-8 text-center text-sm text-muted-foreground">{normalizedQuery ? "No stickers found" : packs.length ? "No stickers in this pack" : "No sticker packs"}</p>}</div><div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-t px-2"><button aria-label="Manage sticker packs" className="flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-muted"><Settings className="h-4 w-4" /></button>{packs.map((pack) => { const cover = pack.stickers[0]; return <button type="button" key={pack.id} aria-label={pack.title} className={`h-8 w-8 shrink-0 rounded p-0.5 ${pack.id === currentPack?.id ? "bg-primary/20" : ""}`} onClick={() => { setActivePackId(pack.id); setQuery(""); }}>{cover && <AuthenticatedImage alt={pack.title} className="h-full w-full object-contain" src={`${API_BASE_URL}/media/${cover.media_file_id}`} />}</button>; })}</div></>}{packDialogOpen && <CreateStickerPackDialog onClose={() => setPackDialogOpen(false)} onCreated={createPack} />}{studioPack && <StickerStudio pack={studioPack} onClose={() => setStudioPack(null)} onSave={saveSticker} />}</aside>;
}
