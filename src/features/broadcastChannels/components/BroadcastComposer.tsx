import { useRef } from "react";
import { Paperclip, SendHorizonal } from "lucide-react";
import { ConversationComposerBar, ConversationComposerShell } from "@/features/messaging/components/ConversationPresentation/ConversationComposerShell";

type Props = { value: string; files: File[]; busy: boolean; contentType: string; onChange: (value: string) => void; onFiles: (files: File[]) => void; onType: (value: "text" | "photo" | "video" | "file" | "album") => void; onSubmit: () => void };

export function BroadcastComposer({ value, files, busy, onChange, onFiles, onType, onSubmit }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} data-testid="broadcast-composer">
    <ConversationComposerShell testId="broadcast-composer-shell">
    <ConversationComposerBar>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-60" aria-label="Attach publication media"><Paperclip className="h-[18px] w-[18px]" /><span className="sr-only">Attach</span></button>
      <input ref={inputRef} id="broadcast-attachments" className="hidden" type="file" multiple onChange={(event) => { const next = Array.from(event.target.files ?? []); onFiles(next); onType(next.length > 1 ? "album" : next[0]?.type.startsWith("image/") ? "photo" : next[0]?.type.startsWith("video/") ? "video" : next.length ? "file" : "text"); event.currentTarget.value = ""; }} />
      <textarea id="broadcast-draft" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Write a publication" rows={1} className="min-h-8 max-h-44 flex-1 resize-none border-0 bg-transparent px-1 py-[6px] text-[15px] leading-5 text-foreground shadow-none outline-none placeholder:text-muted-foreground/85" />
      {files.length > 0 && <span className="max-w-24 truncate text-xs text-muted-foreground" title={files.map((file) => file.name).join(", ")}>{files.length} attached</span>}
      <button type="submit" disabled={busy || (!value.trim() && files.length === 0)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-60" aria-label="Publish"><SendHorizonal className="h-[18px] w-[18px]" /><span className="sr-only">Publish</span></button>
    </ConversationComposerBar>
    </ConversationComposerShell>
  </form>;
}
