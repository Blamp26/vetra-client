import { useState, useRef } from "react";
import { authApi, type UpdateProfilePayload } from "@/api/auth";
import { postFormData, API_BASE_URL } from "@/api/base";
import { useAppStore, type RootState } from "@/store";
import type { User } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { Camera, X } from "lucide-react";

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
  const [usernameFocused, setUsernameFocused] = useState(false);

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
      setError(err instanceof Error ? err.message : "Error uploading avatar");
    } finally {
      setSaving(false);
    }
  };

  async function handleSave() {
    setUsernameErr(null);
    setError(null);

    if (username.trim().length < 2) {
      setUsernameErr("Minimum 2 characters");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setUsernameErr("Only letters, numbers, underscores");
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
      
      // Update status in Presence via socket for instant update for everyone
      if (payload.status) {
        socketManager?.updateStatus(payload.status as any);
      }

      onClose();
    } catch (e: unknown) {
      if (e && typeof e === "object" && "details" in e) {
        const details = (e as { details?: Record<string, string[]> }).details;
        if (details?.username) {
          setUsernameErr(`@${username.trim()} is already taken`);
          return;
        }
      }
      setError(e instanceof Error ? e.message : "Error saving");
    } finally {
      setSaving(false);
    }
  }

  const previewLetter = (displayName.trim() || username.trim() || "?")[0].toUpperCase();

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/40 backdrop-blur-3xl p-4 animate-in fade-in duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]" onClick={onClose}>
      {/* Outer shadow layer for extra depth */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background/20 to-transparent pointer-events-none" />
      
      <div className="relative z-10 bg-card/60 backdrop-blur-3xl border border-white/10 dark:border-white/5 rounded-[2rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/10 w-full max-w-[460px] flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-[0.98] slide-in-from-bottom-8 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="m-0 text-[1.25rem] font-extrabold text-foreground tracking-tight">Edit Profile</h3>
          <button className="p-2 rounded-[0.75rem] bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-white/5 active:scale-90 transition-all duration-300" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar flex flex-col gap-6">
          {/* Аватар */}
          <div className="flex flex-col items-center gap-6">
            <div className="relative w-24 h-24 group">
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              {avatarUrl.trim() ? (
                <img
                  src={avatarUrl}
                  alt="avatar"
                  className="w-24 h-24 rounded-full object-cover block ring-4 ring-background shadow-2xl relative z-10 transition-transform duration-500 group-hover:scale-[1.05]"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary text-primary-foreground text-4xl font-bold flex items-center justify-center shrink-0 ring-4 ring-background shadow-2xl relative z-10 transition-transform duration-500 group-hover:scale-[1.05]">
                  {previewLetter}
                </div>
              )}
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300 z-20 backdrop-blur-sm cursor-pointer"
                title="Update Avatar"
              >
                <Camera className="h-7 w-7 text-white animate-in zoom-in-50" />
              </button>
              <input
                ref={fileInputRef}
                id="profile-avatar-upload"
                name="avatar-file"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); }}
              />
            </div>

            <div className="w-full space-y-2">
              <label className="block ml-1 text-[0.6875rem] font-bold uppercase tracking-widest text-muted-foreground/70" htmlFor="profile-avatar-url">Avatar URL</label>
              <input
                className="w-full px-4 py-3 bg-background/50 border border-transparent rounded-[1rem] text-foreground text-[0.95rem] outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:bg-background/80 ring-1 ring-inset ring-border/30 dark:ring-white/5 focus:ring-primary/50 shadow-sm"
                id="profile-avatar-url"
                name="avatar_url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
              />
            </div>
          </div>

          {/* Никнейм (display_name) */}
          <div className="space-y-2">
            <label className="block ml-1 text-[0.6875rem] font-bold uppercase tracking-widest text-muted-foreground/70" htmlFor="profile-display-name">
              Display Name <span className="opacity-55 font-normal normal-case ml-1">(Optional)</span>
            </label>
            <input
              className="w-full px-4 py-3 bg-background/50 border border-transparent rounded-[1rem] text-foreground text-[0.95rem] outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:bg-background/80 ring-1 ring-inset ring-border/30 dark:ring-white/5 focus:ring-primary/50 shadow-sm"
              id="profile-display-name"
              name="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={username}
              maxLength={64}
            />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <label className="block ml-1 text-[0.6875rem] font-bold uppercase tracking-widest text-muted-foreground/70" htmlFor="profile-username">
              Username <span className="opacity-55 font-normal normal-case ml-1">(Unique)</span>
            </label>

            <div
              className={cn(
                "flex items-center w-full px-4 py-3 bg-background/50 border border-transparent rounded-[1rem] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] gap-1 shadow-sm ring-1 ring-inset",
                usernameErr ? "ring-destructive/50" : usernameFocused ? "bg-background/80 ring-primary/50" : "ring-border/30 dark:ring-white/5"
              )}
            >
              <span className="opacity-40 text-sm font-bold select-none text-foreground">
                @
              </span>
              <input
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-foreground text-[0.95rem] font-medium p-0"
                id="profile-username"
                name="username"
                value={username}
                onChange={(e) => { setUsernameErr(null); setUsername(e.target.value); }}
                onFocus={() => setUsernameFocused(true)}
                onBlur={() => setUsernameFocused(false)}
                minLength={2}
                maxLength={32}
              />
            </div>
          </div>

          {usernameErr && (
            <p className="m-0 mt-1 text-destructive text-sm">
              {usernameErr}
            </p>
          )}

          {/* О себе */}
          <div className="space-y-2">
            <label className="block ml-1 text-[0.6875rem] font-bold uppercase tracking-widest text-muted-foreground/70" htmlFor="profile-bio">About Me</label>
            <div className="relative">
              <textarea
                className="w-full px-4 py-3 bg-background/50 border border-transparent rounded-[1rem] text-foreground text-[0.95rem] outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:bg-background/80 ring-1 ring-inset ring-border/30 dark:ring-white/5 focus:ring-primary/50 shadow-sm min-h-[100px] resize-none"
                id="profile-bio"
                name="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself..."
                maxLength={300}
                rows={3}
              />
              <span className={cn(
                "absolute bottom-3 right-4 text-[0.625rem] font-bold tracking-widest transition-colors duration-300",
                bio.length > 280 ? "text-destructive" : "text-muted-foreground/40"
              )}>
                {bio.length}/300
              </span>
            </div>
          </div>

          {/* Статус */}
          <div className="space-y-3">
            <label className="block ml-1 text-[0.6875rem] font-bold uppercase tracking-widest text-muted-foreground/70">Online Status</label>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { id: 'online', label: 'Online', color: 'bg-online' },
                  { id: 'away', label: 'Away', color: 'bg-away' },
                  { id: 'dnd', label: 'Do Not Disturb', color: 'bg-busy' },
                  { id: 'offline', label: 'Invisible', color: 'bg-offline' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStatus(s.id)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-[1rem] border border-transparent transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-[0.9rem] font-semibold active:scale-[0.96] shadow-sm ring-1 ring-inset",
                    status === s.id 
                      ? "bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_var(--tw-shadow-color)] shadow-primary/40 ring-black/10 dark:ring-white/10" 
                      : "bg-background/50 text-muted-foreground hover:bg-muted/80 ring-border/30 dark:ring-white/5"
                  )}
                >
                  <span className={cn("w-2.5 h-2.5 rounded-full ring-2 ring-white/10", s.color)} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-destructive text-sm mt-2">{error}</p>
          )}
        </div>

        <div className="px-8 py-6 border-t border-white/5 flex gap-4 justify-end bg-white/5 backdrop-blur-md">
          <button 
            className="px-6 py-2.5 bg-background/50 border border-transparent rounded-[1rem] text-foreground text-[0.9rem] font-bold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted active:scale-95 disabled:opacity-50 ring-1 ring-inset ring-border/30 dark:ring-white/5 cursor-pointer" 
            onClick={onClose} 
            disabled={saving}
          >
            Cancel
          </button>
          <button 
            className="px-8 py-2.5 bg-primary text-primary-foreground border-none rounded-[1rem] text-[0.9rem] font-bold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96] hover:bg-primary/95 disabled:opacity-50 shadow-[0_8px_20px_-8px_var(--tw-shadow-color)] shadow-primary/40 ring-1 ring-inset ring-black/10 dark:ring-white/10 cursor-pointer" 
            onClick={handleSave} 
            disabled={saving}
          >
            {saving ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                <span>Saving...</span>
              </div>
            ) : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
