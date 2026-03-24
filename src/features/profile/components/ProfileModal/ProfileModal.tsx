import { useState } from "react";
import { authApi, type UpdateProfilePayload } from "@/api/auth";
import { useAppStore, type RootState } from "@/store";
import type { User } from "@/shared/types";

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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Редактировать профиль</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {/* Аватар */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
            <div style={{ width: 80, height: 80, marginBottom: 12, flexShrink: 0 }}>
              {avatarUrl.trim() ? (
                /*
                  ✅ FIX AVATAR: display:block убирает inline-baseline зазор.
                  transform:translateZ(0) создаёт GPU-слой — это фиксит баг
                  когда overflow:hidden + border-radius не обрезает картинку
                  в Chromium/WebView без аппаратного ускорения.
                */
                <img
                  src={avatarUrl}
                  alt="avatar"
                  className="avatar"
                  style={{
                    display: "block",
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    objectFit: "cover",
                    transform: "translateZ(0)",
                  }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div
                  className="avatar large"
                  style={{
                    width: 80,
                    height: 80,
                    fontSize: "2rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {previewLetter}
                </div>
              )}
            </div>
            <label className="modal-label">URL аватарки</label>
            <input
              className="modal-input"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
            />
          </div>

          {/* Никнейм (display_name) */}
          <label className="modal-label">
            Никнейм <span style={{ opacity: 0.55, fontWeight: 400 }}>(необязательно, не уникальный)</span>
          </label>
          <input
            className="modal-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={username}
            maxLength={64}
          />

          {/* Username */}
          <label className="modal-label" style={{ marginTop: 8 }}>
            Юзернейм <span style={{ opacity: 0.55, fontWeight: 400 }}>(уникальный)</span>
          </label>

          {/*
            ✅ FIX USERNAME @: убираем position:absolute — это был корень проблемы.
            Делаем враппер с теми же стилями что у .modal-input (padding, bg, border, radius).
            @ и <input> — соседние flex-дети с alignItems:center, поэтому они
            всегда идеально выровнены по вертикали без хаков.
            Состояние фокуса отслеживаем через onFocus/onBlur для border-color.
          */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              padding: "10px 12px",
              background: "var(--bg-tertiary)",
              border: `1px solid ${
                usernameErr ? "var(--error, #e55)" : usernameFocused ? "var(--accent)" : "transparent"
              }`,
              borderRadius: "var(--radius)",
              boxSizing: "border-box",
              transition: "border-color 0.15s",
              gap: 2,
            }}
          >
            <span style={{ opacity: 0.5, fontSize: "0.92rem", lineHeight: 1, flexShrink: 0, userSelect: "none" }}>
              @
            </span>
            <input
              style={{
                flex: 1,
                minWidth: 0,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-primary)",
                fontSize: "0.92rem",
                fontFamily: "inherit",
                padding: 0,
              }}
              value={username}
              onChange={(e) => { setUsernameErr(null); setUsername(e.target.value); }}
              onFocus={() => setUsernameFocused(true)}
              onBlur={() => setUsernameFocused(false)}
              minLength={2}
              maxLength={32}
            />
          </div>

          {usernameErr && (
            <p style={{ margin: "4px 0 0", color: "var(--error, #e55)", fontSize: "0.82rem" }}>
              {usernameErr}
            </p>
          )}

          {/* О себе */}
          <label className="modal-label" style={{ marginTop: 8 }}>О себе</label>
          <textarea
            className="modal-input"
            style={{ minHeight: 80, resize: "vertical" }}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Расскажи о себе..."
            maxLength={300}
            rows={3}
          />
          <span style={{ fontSize: "0.72rem", opacity: 0.45, display: "block", textAlign: "right" }}>
            {bio.length}/300
          </span>

          {error && (
            <p style={{ color: "var(--error, #e55)", fontSize: "0.85rem", marginTop: 8 }}>{error}</p>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Отмена</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
