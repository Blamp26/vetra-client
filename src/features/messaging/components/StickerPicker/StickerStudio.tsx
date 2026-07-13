import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { StickerPack } from "@/shared/types";

export type StickerDestination =
  | { kind: "existing"; packId: string }
  | { kind: "new"; title: string; visibility: "private" | "unlisted" | "public" };

type Props = {
  packs: StickerPack[];
  onClose: () => void;
  onSave: (file: File, destination: StickerDestination, tags: string[]) => Promise<void>;
};

const NEW_PACK = "__new_pack__";

export function StickerStudio({ packs, onClose, onSave }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [destination, setDestination] = useState(packs.length ? packs[0].id : NEW_PACK);
  const [newTitle, setNewTitle] = useState("");
  const [visibility, setVisibility] = useState<"private" | "unlisted" | "public">("private");
  const [tags, setTags] = useState("😀");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNewPack = destination === NEW_PACK;
  const title = newTitle.trim();
  const titleError = isNewPack && !title ? "Pack title is required" : title.length > 128 ? "Pack title must be 128 characters or fewer" : null;

  useEffect(() => () => { if (file) URL.revokeObjectURL(URL.createObjectURL(file)); }, [file]);

  const choose = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!["image/png", "image/webp", "image/jpeg"].includes(candidate.type)) { setError("Choose a PNG, WebP, or JPEG image"); return; }
    if (candidate.size > 10 * 1024 * 1024) { setError("Image must be 10 MB or smaller"); return; }
    setError(null); setFile(candidate);
  };

  const submit = async () => {
    if (!file || titleError || (!isNewPack && !packs.some(pack => pack.id === destination))) return;
    setBusy(true); setError(null);
    try {
      const target: StickerDestination = isNewPack ? { kind: "new", title, visibility } : { kind: "existing", packId: destination };
      await onSave(file, target, tags.trim().split(/\s+/).filter(Boolean));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save sticker. Try again.");
    } finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" role="dialog" aria-modal="true" aria-label="Sticker Studio"><div className="w-[760px] max-w-full rounded-xl bg-card p-5 shadow-xl">
    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Sticker Studio</h2><button aria-label="Close" onClick={onClose} disabled={busy}><X className="h-5 w-5" /></button></div>
    <div className="mt-5 grid grid-cols-[1fr_240px] gap-6"><div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); choose(e.dataTransfer.files[0]); }} className="flex h-[512px] items-center justify-center rounded-lg border border-dashed border-border bg-[linear-gradient(45deg,#eee_25%,transparent_25%),linear-gradient(-45deg,#eee_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee_75%),linear-gradient(-45deg,transparent_75%,#eee_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0px]"><button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => input.current?.click()}>{file ? file.name : "Choose or drop image"}</button><input ref={input} type="file" hidden accept="image/png,image/webp,image/jpeg" onChange={e => choose(e.target.files?.[0])} /></div><div className="space-y-4"><div><label className="block text-sm font-medium">Destination</label>{packs.length ? <select aria-label="Destination" className="mt-1 w-full rounded border bg-transparent p-2" value={destination} onChange={e => setDestination(e.target.value)}><optgroup label="Owned packs">{packs.map(pack => <option key={pack.id} value={pack.id}>{pack.title}</option>)}</optgroup><option value={NEW_PACK}>Create new pack</option></select> : <div className="mt-1 rounded border bg-muted p-2 text-sm">Create new pack</div>}</div>{isNewPack && <div className="space-y-3 rounded border border-border p-3"><p className="text-xs text-muted-foreground">A pack will be created before this sticker is saved.</p><label className="block text-sm">Pack title<input aria-label="Pack title" className="mt-1 w-full rounded border bg-transparent p-2" value={newTitle} onChange={e => setNewTitle(e.target.value)} />{titleError && <span className="mt-1 block text-xs text-destructive">{titleError}</span>}</label><label className="block text-sm">Visibility<select aria-label="Visibility" className="mt-1 w-full rounded border bg-transparent p-2" value={visibility} onChange={e => setVisibility(e.target.value as "private" | "unlisted" | "public")}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label></div>}<label className="block text-sm">Emoji tags<input aria-label="Emoji tags" className="mt-1 w-full rounded border bg-transparent p-2" value={tags} onChange={e => setTags(e.target.value)} /></label>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}<button disabled={!file || Boolean(titleError) || busy || (!isNewPack && !packs.some(pack => pack.id === destination))} className="w-full rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" onClick={() => void submit()}>{busy ? "Saving sticker…" : "Save and send"}</button></div></div>
  </div></div>;
}
