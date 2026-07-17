import { useId, useState } from "react";
import { Dialog } from "@/shared/components/Dialog";

type Props = { initialNote: string; onSave: (note: string) => void; onClose: () => void };

export function UserNoteDialog({ initialNote, onSave, onClose }: Props) {
  const titleId = useId();
  const [note, setNote] = useState(initialNote);
  return (
    <Dialog open onClose={onClose} labelledBy={titleId} className="vt-modal-panel relative w-full max-w-md overflow-hidden">
      <div className="border-b border-border px-5 py-4"><h2 id={titleId} className="text-lg font-semibold">Private note</h2></div>
      <form onSubmit={(event) => { event.preventDefault(); onSave(note.slice(0, 500)); }} className="space-y-4 px-5 py-5">
        <label htmlFor="user-note" className="block text-sm font-medium">Only visible to you</label>
        <textarea id="user-note" autoFocus maxLength={500} rows={5} value={note} onChange={(event) => setNote(event.target.value)} className="vt-textarea min-h-28" />
        <div className="flex justify-end gap-2"><button type="button" className="rounded-md px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>Cancel</button><button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Save</button></div>
      </form>
    </Dialog>
  );
}
