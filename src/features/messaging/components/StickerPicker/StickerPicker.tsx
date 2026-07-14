import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Plus, Search, X } from "lucide-react";
import { stickersApi } from "@/api/stickers";
import { API_BASE_URL, postFormData } from "@/api/base";
import { useAppStore } from "@/store";
import type { StickerMessage, StickerPack } from "@/shared/types";
import { StickerStudio, type StickerDestination } from "./StickerStudio";
import type { StickerPackSelectionRequest } from "./StickerPackPreviewDialog";
import { AuthenticatedImage } from "@/shared/components/AuthenticatedImage";
import { giphyApi, type VetraGif } from "@/api/giphy";
import { gifsApi } from "@/api/gifs";
import { ExternalGifTile } from "./ExternalGifTile";
import { computeGifMosaicLayout } from "./gifMosaicLayout";

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

function EditStickerPackDialog({ pack, onClose, onSaved }: { pack: StickerPack; onClose: () => void; onSaved: (title: string, visibility: PackVisibility) => Promise<void> }) {
  const [title, setTitle] = useState(pack.title);
  const [visibility, setVisibility] = useState<PackVisibility>(pack.visibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedTitle = title.trim();
  const titleError = !trimmedTitle ? "Pack title is required" : trimmedTitle.length > 128 ? "Pack title must be 128 characters or fewer" : null;

  const submit = async () => {
    if (titleError || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSaved(trimmedTitle, visibility);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save sticker pack. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" role="dialog" aria-modal="true" aria-label={`Edit ${pack.title}`}><div className="w-[420px] max-w-full rounded-xl bg-card p-5 shadow-xl">
    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Edit sticker pack</h2><button type="button" aria-label="Close" onClick={onClose} disabled={busy}><X className="h-5 w-5" /></button></div>
    <div className="mt-5 space-y-4"><label className="block text-sm font-medium">Pack title<input autoFocus aria-label="Pack title" className="mt-1 w-full rounded border bg-transparent p-2" value={title} onChange={(event) => setTitle(event.target.value)} />{titleError && <span className="mt-1 block text-xs text-destructive">{titleError}</span>}</label><label className="block text-sm font-medium">Visibility<select aria-label="Visibility" className="mt-1 w-full rounded border bg-transparent p-2" value={visibility} onChange={(event) => setVisibility(event.target.value as PackVisibility)}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="rounded px-3 py-2 text-sm hover:bg-muted" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={() => void submit()} disabled={Boolean(titleError) || busy}>{busy ? "Saving…" : "Save"}</button></div></div>
  </div></div>;
}

export function StickerPicker({ onSend, onSendGif, onClose, selectionRequest, onSelectionHandled }: { onSend: (id: string) => Promise<void>; onSendGif?: (gif: VetraGif) => Promise<void>; onClose: () => void; selectionRequest?: StickerPackSelectionRequest | null; onSelectionHandled?: (revision: number) => void }) {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [packDialogOpen, setPackDialogOpen] = useState(false);
  const [editPack, setEditPack] = useState<StickerPack | null>(null);
  const [studioPack, setStudioPack] = useState<StickerPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"stickers" | "gifs">("stickers");
  const [gifQuery, setGifQuery] = useState("");
  const [gifCategory, setGifCategory] = useState("recent");
  const [gifResults, setGifResults] = useState<VetraGif[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifHasMore, setGifHasMore] = useState(false);
  const [gifOffset, setGifOffset] = useState(0);
  const [gifError, setGifError] = useState<string | null>(null);
  const gifRootRef = useRef<HTMLDivElement | null>(null);
  const gifSentinelRef = useRef<HTMLDivElement | null>(null);
  const [gifMosaicWidth, setGifMosaicWidth] = useState(0);
  const gifRequestRef = useRef(0);
  const gifAbortRef = useRef<AbortController | null>(null);
  const gifPageInFlightRef = useRef<{ identity: string; offset: number } | null>(null);
  const gifViewRef = useRef({ activeTab, query: gifQuery, category: gifCategory });
  gifViewRef.current = { activeTab, query: gifQuery, category: gifCategory };
  const currentUser = useAppStore((state) => state.currentUser);
  const saveSession = useRef<{ destinationKey: string; sourceFile?: File; tagsKey: string; packId?: string; mediaId?: string; stickerId?: string }>({ destinationKey: "", tagsKey: "" });

  useEffect(() => {
    let cancelled = false;
    stickersApi.list().then((loaded) => {
      if (cancelled) return;
      setPacks(loaded);
      const requested = selectionRequest?.packId;
      const next = requested && loaded.some((pack) => pack.id === requested) ? requested : loaded[0]?.id ?? null;
      setActivePackId((previous) => {
        if (requested && next === requested) return next;
        return previous && loaded.some((pack) => pack.id === previous) ? previous : next;
      });
      if (requested && next === requested) onSelectionHandled?.(selectionRequest!.revision);
    }).catch(() => {
      if (!cancelled) setError("Unable to load stickers");
    });
    return () => {
      cancelled = true;
    };
  }, [onClose, onSelectionHandled, selectionRequest]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (editPack) setEditPack(null);
      else if (studioPack) setStudioPack(null);
      else if (packDialogOpen) setPackDialogOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [editPack, onClose, packDialogOpen, studioPack]);

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

  const mergeGifs = (next: VetraGif[], replace = false) => {
    setGifResults((current) => {
      const base = replace ? [] : current;
      const seen = new Set(base.map((gif) => gif.providerId));
      return [...base, ...next.filter((gif) => { if (seen.has(gif.providerId)) return false; seen.add(gif.providerId); return true; })];
    });
  };

  const loadSavedGifs = async () => {
    const requestId = ++gifRequestRef.current;
    gifAbortRef.current?.abort();
    const expectedQuery = gifQuery;
    const expectedCategory = gifCategory;
    setGifLoading(true); setGifError(null);
    try {
      const saved = await gifsApi.saved();
      const resolved: VetraGif[] = [];
      for (let index = 0; index < saved.length; index += 100) {
        resolved.push(...await giphyApi.getByIds(saved.slice(index, index + 100).map((gif) => gif.provider_id)));
      }
      if (requestId !== gifRequestRef.current || gifViewRef.current.activeTab !== "gifs" || gifViewRef.current.query !== expectedQuery || gifViewRef.current.category !== expectedCategory) return;
      const order = new Map(saved.map((gif, index) => [gif.provider_id, index]));
      resolved.sort((a, b) => (order.get(a.providerId) ?? 0) - (order.get(b.providerId) ?? 0));
      mergeGifs(resolved, true); setGifHasMore(false); setGifOffset(0);
    } catch (cause) {
      if (requestId === gifRequestRef.current && gifViewRef.current.activeTab === "gifs" && gifViewRef.current.query === expectedQuery && gifViewRef.current.category === expectedCategory) {
        setGifError(cause instanceof Error ? cause.message : "Unable to load saved GIFs");
      }
    }
    finally { if (requestId === gifRequestRef.current) setGifLoading(false); }
  };

  const loadGifPage = async (query: string, offset = 0, replace = false) => {
    if (!giphyApi.isConfigured()) { setGifError("GIF search is not configured"); return; }
    const requestId = ++gifRequestRef.current;
    gifAbortRef.current?.abort();
    const controller = new AbortController();
    gifAbortRef.current = controller;
    setGifLoading(true); setGifError(null);
    try {
      const result = query ? await giphyApi.search(query, offset, controller.signal) : await giphyApi.trending(offset, controller.signal);
      const currentQuery = gifViewRef.current.query.trim() || gifViewRef.current.category;
      if (requestId !== gifRequestRef.current || gifViewRef.current.activeTab !== "gifs" || currentQuery !== query) return;
      mergeGifs(result.results, replace); setGifHasMore(result.hasMore); setGifOffset(result.nextOffset);
    } catch (cause) { if ((cause as Error).name !== "AbortError" && requestId === gifRequestRef.current) setGifError(cause instanceof Error ? cause.message : "Unable to load GIFs"); }
    finally { if (requestId === gifRequestRef.current) setGifLoading(false); }
  };

  const requestNextGifPage = async () => {
    if (activeTab !== "gifs" || !gifQuery.trim() && gifCategory === "recent" || !gifHasMore || gifLoading) return;
    const identity = gifQuery.trim() || gifCategory;
    const offset = gifOffset;
    const inFlight = gifPageInFlightRef.current;
    if (inFlight && inFlight.identity === identity && inFlight.offset === offset) return;
    gifPageInFlightRef.current = { identity, offset };
    try {
      await loadGifPage(identity, offset);
    } finally {
      if (gifPageInFlightRef.current?.identity === identity && gifPageInFlightRef.current.offset === offset) {
        gifPageInFlightRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (activeTab !== "gifs") return;
    const timer = window.setTimeout(() => {
      const trimmed = gifQuery.trim();
      if (!trimmed && gifCategory === "recent") void loadSavedGifs();
      else void loadGifPage(trimmed || gifCategory, 0, true);
    }, gifQuery.trim() ? 400 : 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, gifQuery, gifCategory]);

  useEffect(() => () => gifAbortRef.current?.abort(), []);

  const requestNextGifPageRef = useRef<() => void>(() => undefined);
  requestNextGifPageRef.current = () => { void requestNextGifPage(); };

  useEffect(() => {
    if (activeTab !== "gifs") return;
    const root = gifRootRef.current;
    const sentinel = gifSentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => { if (entry.isIntersecting) requestNextGifPageRef.current(); }),
      { root, rootMargin: "260px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "gifs" || !gifQuery.trim() && gifCategory === "recent" || typeof IntersectionObserver !== "undefined") return;
    const root = gifRootRef.current;
    if (!root) return;
    const onScroll = () => {
      if (root.scrollHeight - root.scrollTop - root.clientHeight < 260) requestNextGifPageRef.current();
    };
    root.addEventListener("scroll", onScroll);
    return () => root.removeEventListener("scroll", onScroll);
  }, [activeTab, gifCategory]);

  useEffect(() => {
    if (activeTab !== "gifs" || !gifQuery.trim() && gifCategory === "recent" || !gifHasMore || gifLoading) return;
    const root = gifRootRef.current;
    if (!root) return;
    const frame = requestAnimationFrame(() => {
      if (root.scrollHeight <= root.clientHeight + 260) requestNextGifPageRef.current();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, gifCategory, gifQuery, gifHasMore, gifLoading, gifOffset, gifResults.length, gifMosaicWidth]);

  useEffect(() => {
    if (activeTab !== "gifs") return;
    const element = gifRootRef.current;
    if (!element) return;
    const update = () => {
      const nextWidth = Math.max(0, Math.round(element.clientWidth - 16));
      setGifMosaicWidth((previous) => previous === nextWidth ? previous : nextWidth);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [activeTab]);

  const createPack = async (title: string, visibility: PackVisibility) => {
    const created = await stickersApi.createPack(title, visibility);
    if (!created?.id) throw new Error("Pack response missing pack id");
    await refreshPacks(created.id);
    setQuery("");
    setPackDialogOpen(false);
  };

  const updatePack = async (title: string, visibility: PackVisibility) => {
    if (!editPack) return;
    const updated = await stickersApi.updatePack(editPack.id, { title, visibility });
    if (!updated?.id) throw new Error("Pack response missing pack id");
    await refreshPacks(editPack.id);
    setEditPack(null);
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

  const gifMosaicLayout = useMemo(
    () => computeGifMosaicLayout(gifResults, gifMosaicWidth),
    [gifResults, gifMosaicWidth],
  );

  return <aside className="sticker-picker flex h-full w-[292px] shrink-0 flex-col border-l border-border bg-card" data-testid="sticker-picker">
    <div className="flex h-[43px] border-b"><button className="w-1/3 text-sm text-muted-foreground" disabled>Emoji</button><button type="button" className={`relative w-1/3 text-sm ${activeTab === "stickers" ? "font-medium" : "text-muted-foreground"}`} onClick={() => setActiveTab("stickers")}>Stickers{activeTab === "stickers" && <span className="absolute bottom-0 left-1/2 h-[3px] w-[54px] -translate-x-1/2 rounded bg-primary" />}</button><button type="button" className={`relative w-1/3 text-sm ${activeTab === "gifs" ? "font-medium" : "text-muted-foreground"}`} onClick={() => setActiveTab("gifs")}>GIFs{activeTab === "gifs" && <span className="absolute bottom-0 left-1/2 h-[3px] w-[54px] -translate-x-1/2 rounded bg-primary" />}</button></div>
    <div className="flex h-[53px] items-center gap-[6px] px-[14px]"><div className="flex h-[32px] w-[228px] items-center gap-2 rounded bg-muted px-2"><Search className="h-4 w-4" /><input aria-label={activeTab === "gifs" ? "Search GIFs" : "Search stickers"} placeholder={activeTab === "gifs" ? "Search GIFs" : undefined} className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={activeTab === "gifs" ? gifQuery : query} onChange={(event) => activeTab === "gifs" ? setGifQuery(event.target.value) : setQuery(event.target.value)} />{activeTab === "gifs" && gifQuery && <button type="button" aria-label="Clear GIF search" onClick={() => { setGifQuery(""); setGifCategory("recent"); }}><X className="h-4 w-4" /></button>}</div>{activeTab === "stickers" && <button aria-label="Create sticker pack" title="Create sticker pack" className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted" onClick={() => setPackDialogOpen(true)}><Plus className="h-[18px] w-[18px]" /></button>}</div>
    {activeTab === "gifs" ? <><div className="px-3 pb-1 text-center text-[10px] font-medium text-muted-foreground">Powered by GIPHY</div><div ref={gifRootRef} className="min-h-0 flex-1 overflow-y-auto px-2 [scrollbar-gutter:stable]"><div className="relative w-full" style={{ height: gifMosaicLayout.height }}>{gifResults.map((gif, index) => { const layout = gifMosaicLayout.tiles[index]; return layout ? <ExternalGifTile key={gif.providerId} gif={gif} layout={layout} root={gifRootRef.current} onSend={async () => { if (onSendGif) { await onSendGif(gif); if (!gifQuery.trim() && gifCategory === "recent") await loadSavedGifs(); } }} /> : null; })}</div><div ref={gifSentinelRef} data-testid="gif-pagination-sentinel" aria-hidden="true" className="h-px w-full" />{gifLoading && <p className="p-4 text-center text-xs text-muted-foreground">Loading GIFs…</p>}{gifError && <p role="alert" className="p-4 text-center text-xs text-destructive">{gifError}</p>}{!gifLoading && !gifError && gifResults.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{gifCategory === "recent" ? "No saved GIFs" : "No GIFs found"}</p>}</div><div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-t px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{[["recent", "Recent"], ["👍", "👍"], ["😘", "😘"], ["😍", "😍"], ["😡", "😡"], ["🎉", "🎉"], ["😂", "😂"], ["😮", "😮"], ["😢", "😢"]].map(([key, label]) => <button type="button" key={key} aria-label={label} className={`h-8 min-w-8 rounded px-1 text-base ${gifCategory === key ? "bg-primary/20" : "hover:bg-muted"}`} onClick={() => { setGifCategory(key); setGifQuery(""); }}>{key === "recent" ? <Clock className="mx-auto h-4 w-4" /> : label}</button>)}</div></> : error ? <div className="p-4 text-sm text-destructive">{error}</div> : <><div className="flex h-10 items-center px-3 text-xs font-medium"><span>{currentPack?.title ?? "Stickers"}</span>{currentPackIsOwned && currentPack && <button type="button" aria-label={`Edit ${currentPack.title}`} className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2" onClick={() => setEditPack(currentPack)}>edit</button>}</div><div className="min-h-0 flex-1 overflow-y-auto px-[14px] py-2"><div className="grid grid-cols-4 gap-[6px]">{!normalizedQuery && currentPackIsOwned && <button type="button" aria-label={`Add sticker to ${currentPack?.title}`} title="Create sticker" className="flex h-[62px] w-[62px] items-center justify-center rounded bg-muted/60 hover:bg-muted focus-visible:outline focus-visible:outline-2" onClick={() => currentPack && setStudioPack(currentPack)}><Plus className="h-6 w-6" /></button>}{visibleStickers.map((sticker) => <button type="button" key={sticker.id} aria-label={`Sticker ${sticker.emoji_tags.join(" ")}`} className="flex h-[62px] w-[62px] items-center justify-center rounded hover:bg-muted focus-visible:outline focus-visible:outline-2" onClick={() => void onSend(sticker.id)}><AuthenticatedImage alt={sticker.emoji_tags.join(" ")} className="max-h-full max-w-full object-contain" src={`${API_BASE_URL}/media/${sticker.media_file_id}`} /></button>)}</div>{!visibleStickers.length && !(currentPackIsOwned && !normalizedQuery) && <p className="py-8 text-center text-sm text-muted-foreground">{normalizedQuery ? "No stickers found" : packs.length ? "No stickers in this pack" : "No sticker packs"}</p>}</div><div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-t px-2">{packs.map((pack) => { const cover = pack.stickers[0]; return <button type="button" key={pack.id} aria-label={pack.title} className={`h-8 w-8 shrink-0 rounded p-0.5 ${pack.id === currentPack?.id ? "bg-primary/20" : ""}`} onClick={() => { setActivePackId(pack.id); setQuery(""); }}>{cover && <AuthenticatedImage alt={pack.title} className="h-full w-full object-contain" src={`${API_BASE_URL}/media/${cover.media_file_id}`} />}</button>; })}</div></>}
    {packDialogOpen && <CreateStickerPackDialog onClose={() => setPackDialogOpen(false)} onCreated={createPack} />}{editPack && <EditStickerPackDialog pack={editPack} onClose={() => setEditPack(null)} onSaved={updatePack} />}{studioPack && <StickerStudio pack={studioPack} onClose={() => setStudioPack(null)} onSave={saveSticker} />}
  </aside>;
}
