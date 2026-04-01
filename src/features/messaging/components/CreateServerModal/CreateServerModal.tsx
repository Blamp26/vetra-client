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
      setError("Enter server name");
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
      setError("Create failed");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border w-full max-w-md flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-normal">Create Server</h3>
          <button onClick={onClose} className="text-2xl">×</button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {error && <div className="bg-destructive/10 border border-destructive p-2 text-destructive text-xs">{error}</div>}

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-muted-foreground" htmlFor="create-server-name">Server name</label>
            <input
              className="w-full px-2 py-2 bg-background border border-border text-sm outline-none"
              id="create-server-name"
              type="text"
              placeholder="Name..."
              value={name}
              maxLength={100}
              autoFocus
              onChange={(e) => { setName(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
        </div>

        <div className="p-4 border-t border-border flex gap-2 justify-end">
          <button className="px-4 py-2 text-sm border border-border" onClick={onClose} disabled={isCreating}>Cancel</button>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground text-sm border border-primary disabled:opacity-50"
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
          >
            {isCreating ? "..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
