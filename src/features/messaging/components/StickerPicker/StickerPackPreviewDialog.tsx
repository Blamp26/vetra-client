import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { stickersApi } from "@/api/stickers";
import { StickerArtwork } from "./StickerArtwork";
import { useAppStore } from "@/store";
import type { StickerPack } from "@/shared/types";

export interface StickerPackSelectionRequest {
  packId: string;
  stickerId: string;
  revision: number;
}

interface Props {
  request: StickerPackSelectionRequest;
  onClose: () => void;
  onOpenPack: (packId: string) => void;
}

export function StickerPackPreviewDialog({ request, onClose, onOpenPack }: Props) {
  const currentUser = useAppStore((state) => state.currentUser);
  const [pack, setPack] = useState<StickerPack | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPack(null);
    setLoading(true);
    setError(null);
    void Promise.all([stickersApi.get(request.packId), stickersApi.list()])
      .then(([loadedPack, loadedPacks]) => {
        if (cancelled) return;
        setPack(loadedPack);
        setInstalledIds(new Set(loadedPacks.map((item) => item.id)));
      })
      .catch(() => {
        if (!cancelled) setError("Sticker pack is unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request.packId, request.revision]);

  const isOwned = Boolean(pack && currentUser && pack.owner_id === currentUser.id);
  const isInstalled = Boolean(pack && installedIds.has(pack.id));
  const canInstall = Boolean(pack && !isOwned && !isInstalled);
  const title = pack?.title ?? "Sticker pack";
  const grid = useMemo(() => pack?.stickers ?? [], [pack]);

  const install = async () => {
    if (!pack || busy || !canInstall) return;
    setBusy(true);
    setError(null);
    try {
      await stickersApi.install(pack.id);
      const refreshed = await stickersApi.list();
      if (!refreshed.some((item) => item.id === pack.id)) {
        throw new Error("Pack was not installed");
      }
      onOpenPack(pack.id);
    } catch {
      setError("Could not add stickers. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sticker-pack-preview-title"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[min(424px,calc(100vh-48px))] w-[365px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl bg-card shadow-xl">
        <header className="flex h-[54px] shrink-0 items-center justify-between border-b px-4">
          <h2 id="sticker-pack-preview-title" className="truncate text-base font-semibold">{title}</h2>
          <button type="button" aria-label="Close sticker pack preview" onClick={onClose} disabled={busy} className="rounded p-1 hover:bg-muted focus-visible:outline focus-visible:outline-2">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-[19px] py-3" aria-busy={loading}>
          {loading && <p className="py-12 text-center text-sm text-muted-foreground">Loading sticker pack…</p>}
          {!loading && error && <p role="alert" className="py-12 text-center text-sm text-destructive">{error}</p>}
          {!loading && !error && !grid.length && <p className="py-12 text-center text-sm text-muted-foreground">No stickers in this pack</p>}
          {!loading && !error && grid.length > 0 && (
            <div className="grid grid-cols-5 gap-[7px]" data-testid="sticker-pack-preview-grid">
              {grid.map((sticker) => (
                <div key={sticker.id} className={`flex h-[52px] w-[52px] items-center justify-center rounded-md p-1 ${sticker.id === request.stickerId ? "bg-primary/15 outline outline-2 outline-primary" : "hover:bg-muted"}`}>
                  <StickerArtwork sticker={sticker} className="max-h-full max-w-full object-contain" />
                </div>
              ))}
            </div>
          )}
        </div>
        <footer className="flex h-[56px] shrink-0 items-center justify-end gap-2 border-t px-4">
          {(!pack || error || (!loading && !canInstall && !isOwned && !isInstalled)) && <button type="button" className="rounded px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>Close</button>}
          {pack && !error && (isOwned || isInstalled) && <><button type="button" className="rounded px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>Close</button><button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90" onClick={() => onOpenPack(pack.id)}>Open pack</button></>}
          {pack && !error && canInstall && <>
            <button type="button" className="rounded px-3 py-2 text-sm hover:bg-muted" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={() => void install()} disabled={busy}>{busy ? "Adding…" : "Add stickers"}</button>
          </>}
        </footer>
      </div>
    </div>
  );
}
