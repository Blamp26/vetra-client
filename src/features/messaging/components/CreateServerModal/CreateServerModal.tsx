import { useState } from "react";
import { useAppStore, type RootState } from "@/store";
import { serversApi } from "@/api/servers";

interface Props {
  onClose: () => void;
}

export function CreateServerModal({ onClose }: Props) {
  const currentUser  = useAppStore((s: RootState) => s.currentUser);
  const upsertServer = useAppStore((s: RootState) => s.upsertServer);
  const setActiveChat = useAppStore((s: RootState) => s.setActiveChat);

  const [name,       setName]       = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const handleCreate = async () => {
    if (!currentUser) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a server name.");
      return;
    }
    if (trimmed.length > 100) {
      setError("Server name must be 100 characters or fewer.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const server = await serversApi.create(trimmed);
      upsertServer(server);
      setActiveChat({ type: "server", serverId: server.id });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create server.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter")  handleCreate();
    if (e.key === "Escape") onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-[440px] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="m-0 text-lg font-bold text-foreground">Create a Server</h3>
          <button className="bg-transparent border-none text-2xl cursor-pointer text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="p-6">
          {error && <div className="bg-destructive/10 border border-destructive rounded-lg p-2.5 px-3 text-destructive text-sm mb-4">{error}</div>}

          <label className="block mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Server name</label>
          <input
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm font-inherit outline-none focus:border-primary focus-visible:ring-1 focus-visible:ring-ring"
            type="text"
            placeholder="My Awesome Server"
            value={name}
            maxLength={100}
            autoFocus
            onChange={(e) => { setName(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
          />
          <p className="text-xs text-muted-foreground mt-1">
            You can always change this later.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end bg-muted/30">
          <button className="px-4 py-2 bg-background border border-border rounded-lg text-muted-foreground text-sm font-inherit cursor-pointer hover:bg-accent" onClick={onClose} disabled={isCreating}>
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground border-none rounded-lg text-sm font-bold font-inherit cursor-pointer hover:bg-primary/90 disabled:opacity-50"
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
          >
            {isCreating ? "Creating…" : "Create Server"}
          </button>
        </div>
      </div>
    </div>
  );
}
