import { useState, useRef } from "react";
import { authApi, type UpdateProfilePayload } from "@/api/auth";
import { postFormData, API_BASE_URL } from "@/api/base";
import { useAppStore, type RootState } from "@/store";
import type { User } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { X } from "lucide-react";

interface Props {
  user:    User;
  onClose: () => void;
}

export function ProfileModal({ user, onClose }: Props) {
  const updateCurrentUser = useAppStore((s: RootState) => s.updateCurrentUser);
  const socketManager     = useAppStore((s: RootState) => s.socketManager);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/50 p-4" onClick={onClose}>
      <div className="relative z-10 bg-card border border-border w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-normal">Profile</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4 overflow-y-auto flex flex-col gap-4">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-20 h-20 group">
              <div className="w-20 h-20 bg-primary text-primary-foreground text-2xl flex items-center justify-center border border-border">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  (displayName || username)[0].toUpperCase()
                )}
              </div>
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] uppercase"
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
              <label className="text-[10px] uppercase text-muted-foreground">Avatar URL</label>
              <input
                className="w-full px-2 py-2 bg-background border border-border text-sm outline-none"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground">Display Name</label>
            <input
              className="w-full px-2 py-2 bg-background border border-border text-sm outline-none"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={64}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground">Username</label>
            <input
              className="w-full px-2 py-2 bg-background border border-border text-sm outline-none"
              value={username}
              onChange={(e) => { setUsernameErr(null); setUsername(e.target.value); }}
              minLength={2}
              maxLength={32}
            />
            {usernameErr && <p className="text-destructive text-[10px]">{usernameErr}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground">Bio</label>
            <textarea
              className="w-full px-2 py-2 bg-background border border-border text-sm outline-none resize-none"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={300}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase text-muted-foreground">Status</label>
            <div className="grid grid-cols-2 gap-2">
              {(['online', 'away', 'dnd', 'offline'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "px-3 py-2 text-xs border",
                    status === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"
                  )}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>

        <div className="p-4 border-t border-border flex gap-2 justify-end">
          <button className="px-4 py-2 text-sm border border-border" onClick={onClose}>Cancel</button>
          <button 
            className="px-4 py-2 text-sm bg-primary text-primary-foreground border border-primary disabled:opacity-50"
            onClick={handleSave} 
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
