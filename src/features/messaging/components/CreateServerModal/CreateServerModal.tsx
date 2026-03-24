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
      const server = await serversApi.create(trimmed, currentUser.id);
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

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create a Server</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && <div className="error-banner">{error}</div>}

          <label className="modal-label">Server name</label>
          <input
            className="modal-input"
            type="text"
            placeholder="My Awesome Server"
            value={name}
            maxLength={100}
            autoFocus
            onChange={(e) => { setName(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
          />
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
            You can always change this later.
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isCreating}>
            Cancel
          </button>
          <button
            className="btn-primary"
            style={{ marginTop: 0 }}
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
