import { useId, useState, useRef } from "react";
import { authApi, type UpdateProfilePayload } from "@/api/auth";
import { postFormData, API_BASE_URL } from "@/api/base";
import { useAppStore, type RootState } from "@/store";
import type { User } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { X } from "lucide-react";
import { Dialog } from "@/shared/components/Dialog";
import { Button } from "@/shared/components/Button";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";

interface Props {
  user:    User;
  onClose: () => void;
}

export function ProfileModal({ user, onClose }: Props) {
  const updateCurrentUser = useAppStore((s: RootState) => s.updateCurrentUser);
  const socketManager     = useAppStore((s: RootState) => s.socketManager);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const usernameErrorId = useId();

  const [username,    setUsername]    = useState(user.username);
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [bio,         setBio]         = useState(user.bio ?? "");
  const [avatarUrl,   setAvatarUrl]   = useState(user.avatar_url ?? "");
  const [status,      setStatus]      = useState<'online' | 'away' | 'dnd' | 'offline'>(user.status || "online");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [usernameErr, setUsernameErr] = useState<string | null>(null);

  const handleAvatarUpload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    setSaving(true);
    setError(null);
    try {
      const res = await postFormData<{ media_file_id: string }>("/media", fd);
      const url = `${API_BASE_URL}/media/${res.media_file_id}`;
      setAvatarUrl(url);
    } catch (err) {
      setError("Upload error");
    } finally {
      setSaving(false);
    }
  };

  async function handleSave() {
    setUsernameErr(null);
    setError(null);

    if (username.trim().length < 2) {
      setUsernameErr("Min 2 chars");
      return;
    }

    setSaving(true);
    try {
      const payload: UpdateProfilePayload = {
        username:     username.trim(),
        display_name: displayName.trim() || null,
        bio:          bio.trim()         || null,
        avatar_url:   avatarUrl.trim()   || null,
        status:       status as any,
      };
      const updated = await authApi.updateProfile(user.id, payload);
      updateCurrentUser(updated);
      
      if (payload.status) {
        socketManager?.updateStatus(payload.status as any);
      }

      onClose();
    } catch (e: any) {
      setError("Save error");
    } finally {
      setSaving(false);
    }
  }

  const usernameInvalid = Boolean(usernameErr);

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={usernameInputRef}
      backdropClassName="vt-modal-backdrop"
      className="vt-modal-panel relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden"
    >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <span className="vt-kicker">Profile</span>
            <h3 id={titleId} className="mt-1 text-xl font-semibold tracking-tight">Edit account details</h3>
          </div>
          <IconButton label="Close profile" size="default" tone="neutral" onClick={onClose} className="vt-button vt-button--ghost vt-button--icon h-9 w-9 px-0">
            <X className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
          <div className="vt-panel flex flex-col items-center gap-4 bg-sidebar/35 p-5">
            <div className="group relative h-24 w-24">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[18px] border border-border bg-primary text-3xl font-semibold text-primary-foreground">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  (displayName || username)[0].toUpperCase()
                )}
              </div>
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-[18px] bg-black/50 text-[10px] font-semibold uppercase tracking-[0.08em] text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                Change
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); }}
              />
            </div>

            <div className="w-full space-y-1">
              <label className="vt-label" htmlFor="profile-avatar-url">Avatar URL</label>
              <TextInput
                className="vt-input"
                id="profile-avatar-url"
                aria-label="Avatar URL"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="vt-label" htmlFor="profile-display-name">Display Name</label>
            <TextInput
              className="vt-input"
              id="profile-display-name"
              aria-label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={64}
            />
          </div>

          <div className="space-y-1">
            <label className="vt-label" htmlFor="profile-username">Username</label>
            <TextInput
              ref={usernameInputRef}
              className="vt-input"
              id="profile-username"
              value={username}
              onChange={(e) => { setUsernameErr(null); setUsername(e.target.value); }}
              minLength={2}
              maxLength={32}
              invalid={usernameInvalid}
              aria-describedby={usernameInvalid ? usernameErrorId : undefined}
            />
            {usernameErr && <p id={usernameErrorId} role="alert" className="text-[11px] text-destructive">{usernameErr}</p>}
          </div>

          <div className="space-y-1">
            <label className="vt-label">Bio</label>
            <textarea
              className="vt-textarea resize-none"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={300}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <label className="vt-label">Status</label>
            <div className="grid grid-cols-2 gap-2">
              {(['online', 'away', 'dnd', 'offline'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "vt-button min-h-10 justify-start px-3 text-xs uppercase tracking-[0.06em]",
                    status === s ? "vt-button--primary" : ""
                  )}
                >
                  {s === "dnd" ? "Do Not Disturb" : s}
                </button>
              ))}
            </div>
          </div>

          {error && <p role="alert" className="text-destructive text-xs">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSave} 
            disabled={saving}
            loading={saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
    </Dialog>
  );
}
