import { Paperclip, Send } from "lucide-react";
import { IconButton } from "@/shared/components/IconButton";
import { Button } from "@/shared/components/Button";

type Props = { value: string; files: File[]; busy: boolean; contentType: string; onChange: (value: string) => void; onFiles: (files: File[]) => void; onType: (value: "text" | "photo" | "video" | "file" | "album") => void; onSubmit: () => void };

export function BroadcastComposer({ value, files, busy, contentType, onChange, onFiles, onType, onSubmit }: Props) {
  return <form className="border-t border-border bg-background px-4 py-3" onSubmit={(event) => { event.preventDefault(); onSubmit(); }} data-testid="broadcast-composer">
    <div className="flex items-end gap-2 rounded-xl border border-border bg-card px-2 py-2 shadow-sm focus-within:border-primary">
      <input id="broadcast-attachments" className="sr-only" type="file" multiple={contentType === "album"} accept={contentType === "photo" ? "image/*" : contentType === "video" ? "video/*" : undefined} onChange={(event) => onFiles(Array.from(event.target.files ?? []))} />
      <IconButton label="Attach publication media" type="button" size="compact" onClick={() => document.getElementById("broadcast-attachments")?.click()}><Paperclip className="h-4 w-4" aria-hidden="true" /></IconButton>
      <textarea id="broadcast-draft" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Write a publication" rows={1} className="max-h-32 min-h-8 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none" />
      <select aria-label="Publication type" value={contentType} onChange={(event) => onType(event.target.value as Props["contentType"] & ("text" | "photo" | "video" | "file" | "album"))} className="max-w-20 bg-transparent text-xs text-muted-foreground outline-none"><option value="text">Text</option><option value="photo">Photo</option><option value="video">Video</option><option value="file">File</option><option value="album">Album</option></select>
      {files.length > 0 && <span className="max-w-24 truncate text-xs text-muted-foreground" title={files.map((file) => file.name).join(", ")}>{files.length} attached</span>}
      <Button type="submit" disabled={busy || (!value.trim() && files.length === 0)} aria-label="Publish"><Send className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Publish</span></Button>
    </div>
  </form>;
}
