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
      <div className="bg-white border border-[#E1E1E1] rounded-lg shadow-xl w-full max-w-[440px] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#E1E1E1] flex items-center justify-between">
          <h3 className="m-0 text-[1.1rem] font-bold">Create a Server</h3>
          <button className="bg-none border-none text-[1.5rem] cursor-pointer text-[#7A7A7A] hover:text-[#0A0A0A]" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="p-6">
          {error && <div className="bg-[#E74C3C]/12 border border-[#E74C3C] rounded-lg p-2.5 px-3 text-[#E74C3C] text-[0.85rem] mb-4">{error}</div>}

          <label className="block mb-1.5 text-[0.78rem] font-bold uppercase tracking-[0.06em] text-[#4A4A4A]">Server name</label>
          <input
            className="w-full px-3 py-2 bg-white border border-[#E1E1E1] rounded-lg text-[#0A0A0A] text-[0.88rem] font-inherit outline-none focus:border-[#5865F2]"
            type="text"
            placeholder="My Awesome Server"
            value={name}
            maxLength={100}
            autoFocus
            onChange={(e) => { setName(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
          />
          <p className="text-[0.78rem] text-[#7A7A7A] mt-1">
            You can always change this later.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-[#E1E1E1] flex gap-3 justify-end bg-[#F8F8F8]">
          <button className="px-4 py-2 bg-white border border-[#E1E1E1] rounded-lg text-[#4A4A4A] text-[0.88rem] font-inherit cursor-pointer hover:bg-[#EDEDED]" onClick={onClose} disabled={isCreating}>
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-[#5865F2] text-white border-none rounded-lg text-[0.88rem] font-bold font-inherit cursor-pointer hover:bg-[#4752C4] disabled:opacity-50"
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
