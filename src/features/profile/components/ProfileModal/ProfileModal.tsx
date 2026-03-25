import { useState } from "react";
import { authApi, type UpdateProfilePayload } from "@/api/auth";
import { useAppStore, type RootState } from "@/store";
import type { User } from "@/shared/types";
import { cn } from "@/shared/utils/cn";

interface Props {
  user:    User;
  onClose: () => void;
}

export function ProfileModal({ user, onClose }: Props) {
  const updateCurrentUser = useAppStore((s: RootState) => s.updateCurrentUser);

  const [username,    setUsername]    = useState(user.username);
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [bio,         setBio]         = useState(user.bio ?? "");
  const [avatarUrl,   setAvatarUrl]   = useState(user.avatar_url ?? "");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [usernameErr, setUsernameErr] = useState<string | null>(null);
  const [usernameFocused, setUsernameFocused] = useState(false);

  async function handleSave() {
    setUsernameErr(null);
    setError(null);

    if (username.trim().length < 2) {
      setUsernameErr("Минимум 2 символа");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setUsernameErr("Только буквы, цифры, подчёркивание");
      return;
    }

    setSaving(true);
    try {
      const payload: UpdateProfilePayload = {
        username:     username.trim(),
        display_name: displayName.trim() || null,
        bio:          bio.trim()         || null,
        avatar_url:   avatarUrl.trim()   || null,
      };
      const updated = await authApi.updateProfile(user.id, payload);
      updateCurrentUser(updated);
      onClose();
    } catch (e: unknown) {
      if (e && typeof e === "object" && "details" in e) {
        const details = (e as { details?: Record<string, string[]> }).details;
        if (details?.username) {
          setUsernameErr(`@${username.trim()} уже занят`);
          return;
        }
      }
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  const previewLetter = (displayName.trim() || username.trim() || "?")[0].toUpperCase();

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white border border-[#E1E1E1] rounded-lg shadow-xl w-full max-w-[440px] flex flex-col max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#E1E1E1] flex items-center justify-between">
          <h3 className="m-0 text-[1.1rem] font-bold">Редактировать профиль</h3>
          <button className="bg-none border-none text-[1.5rem] cursor-pointer text-[#7A7A7A] hover:text-[#0A0A0A]" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Аватар */}
          <div className="flex flex-col items-center mb-4">
            <div className="w-20 h-20 mb-3 shrink-0">
              {avatarUrl.trim() ? (
                <img
                  src={avatarUrl}
                  alt="avatar"
                  className="w-20 h-20 rounded-full object-cover block transform translate-z-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#5865F2] text-white text-[2rem] font-bold flex items-center justify-center shrink-0">
                  {previewLetter}
                </div>
              )}
            </div>
            <label className="block mb-1.5 text-[0.78rem] font-bold uppercase tracking-[0.06em] text-[#4A4A4A] self-start">URL аватарки</label>
            <input
              className="w-full px-3 py-2 bg-white border border-[#E1E1E1] rounded-lg text-[#0A0A0A] text-[0.88rem] font-inherit outline-none focus:border-[#5865F2]"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
            />
          </div>

          {/* Никнейм (display_name) */}
          <label className="block mb-1.5 text-[0.78rem] font-bold uppercase tracking-[0.06em] text-[#4A4A4A]">
            Никнейм <span className="opacity-55 font-normal normal-case">(необязательно, не уникальный)</span>
          </label>
          <input
            className="w-full px-3 py-2 bg-white border border-[#E1E1E1] rounded-lg text-[#0A0A0A] text-[0.88rem] font-inherit outline-none focus:border-[#5865F2]"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={username}
            maxLength={64}
          />

          {/* Username */}
          <label className="block mb-1.5 mt-2 text-[0.78rem] font-bold uppercase tracking-[0.06em] text-[#4A4A4A]">
            Юзернейм <span className="opacity-55 font-normal normal-case">(уникальный)</span>
          </label>

          <div
            className={cn(
              "flex items-center w-full px-3 py-2 bg-white border rounded-lg transition-colors duration-150 gap-0.5",
              usernameErr ? "border-[#E74C3C]" : usernameFocused ? "border-[#5865F2]" : "border-[#E1E1E1]"
            )}
          >
            <span className="opacity-50 text-[0.92rem] leading-none shrink-0 select-none">
              @
            </span>
            <input
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-[#0A0A0A] text-[0.92rem] font-inherit p-0"
              value={username}
              onChange={(e) => { setUsernameErr(null); setUsername(e.target.value); }}
              onFocus={() => setUsernameFocused(true)}
              onBlur={() => setUsernameFocused(false)}
              minLength={2}
              maxLength={32}
            />
          </div>

          {usernameErr && (
            <p className="m-0 mt-1 text-[#E74C3C] text-[0.82rem]">
              {usernameErr}
            </p>
          )}

          {/* О себе */}
          <label className="block mb-1.5 mt-2 text-[0.78rem] font-bold uppercase tracking-[0.06em] text-[#4A4A4A]">О себе</label>
          <textarea
            className="w-full px-3 py-2 bg-white border border-[#E1E1E1] rounded-lg text-[#0A0A0A] text-[0.88rem] font-inherit outline-none focus:border-[#5865F2] min-h-[80px] resize-vertical"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Расскажи о себе..."
            maxLength={300}
            rows={3}
          />
          <span className="text-[0.72rem] opacity-45 block text-right">
            {bio.length}/300
          </span>

          {error && (
            <p className="text-[#E74C3C] text-[0.85rem] mt-2">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#E1E1E1] flex gap-3 justify-end bg-[#F8F8F8]">
          <button className="px-4 py-2 bg-white border border-[#E1E1E1] rounded-lg text-[#4A4A4A] text-[0.88rem] font-inherit cursor-pointer hover:bg-[#EDEDED] disabled:opacity-50" onClick={onClose} disabled={saving}>Отмена</button>
          <button className="px-4 py-2 bg-[#5865F2] text-white border-none rounded-lg text-[0.88rem] font-bold font-inherit cursor-pointer hover:bg-[#4752C4] disabled:opacity-50" onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
