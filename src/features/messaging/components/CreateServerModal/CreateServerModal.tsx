import { useId, useRef, useState } from "react";
import { useAppStore, type RootState } from "@/store";
import { serversApi } from "@/api/servers";
import { serverChatForServer } from "@/shared/utils/chatRoutes";
import { Dialog } from "@/shared/components/Dialog";
import { Button } from "@/shared/components/Button";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";
import { X } from "lucide-react";

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
  const titleId = useId();
  const nameErrorId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

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
      setActiveChat(serverChatForServer(server));
      onClose();
    } catch (err) {
      setError("Create failed");
    } finally {
      setIsCreating(false);
    }
  };

  const nameInvalid = error === "Enter server name";

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={nameInputRef}
      className="w-full max-w-md flex flex-col"
    >
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 id={titleId} className="text-lg font-normal">Create Server</h3>
        <IconButton label="Close create server" size="default" onClick={onClose}>
          <X className="h-5 w-5" aria-hidden="true" />
        </IconButton>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {error && <div id={nameInvalid ? nameErrorId : undefined} role="alert" className="text-sm text-destructive">{error}</div>}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="create-server-name">Server name</label>
          <TextInput
            ref={nameInputRef}
            className="w-full"
            id="create-server-name"
            type="text"
            placeholder="Name..."
            value={name}
            maxLength={100}
            invalid={nameInvalid}
            aria-describedby={nameInvalid ? nameErrorId : undefined}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
        </div>
      </div>

      <div className="p-4 border-t border-border flex gap-2 justify-end">
        <Button variant="secondary" onClick={onClose} disabled={isCreating}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleCreate}
          disabled={isCreating || !name.trim()}
          loading={isCreating}
        >
          Create
        </Button>
      </div>
    </Dialog>
  );
}
