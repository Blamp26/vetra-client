import { useState, useEffect } from "react";
import { useAppStore, type RootState } from "@/store";
import { ProfileModal } from "@/features/profile/components/ProfileModal/ProfileModal";
import { themeLabels, type Theme } from "@/themes";
import { ConfirmModal } from "@/shared/components/ConfirmModal/ConfirmModal";

type SettingsTab =
  | "account"
  | "profile"
  | "appearance"
  | "notifications"
  | "audioVideo"
  | "privacy";

interface Props {
  onClose: () => void;
}

export function SettingsPage({ onClose }: Props) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const theme = useAppStore((s: RootState) => s.theme);
  const setTheme = useAppStore((s: RootState) => s.setTheme);
  const logout = useAppStore((s: RootState) => s.logout);
  const [tab, setTab] = useState<SettingsTab>("account");
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Закрытие по Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: "account", label: "Account", icon: "👤" },
    { id: "profile", label: "Profile", icon: "🪪" },
    { id: "appearance", label: "Appearance", icon: "🎨" },
    { id: "notifications", label: "Notifications", icon: "🔔" },
    { id: "audioVideo", label: "Audio & Video", icon: "🎙️" },
  ];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex",
        animation: "fadeIn 0.15s ease",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 220, flexShrink: 0,
          background: "var(--bg-secondary)",
          borderRight: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
          padding: "24px 12px 12px",
        }}
      >
        <div style={{ marginBottom: 20, paddingLeft: 8 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Настройки</h2>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 10px", borderRadius: "var(--radius)",
                border: "none", background: tab === t.id ? "var(--bg-hover)" : "none",
                color: tab === t.id ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer", fontFamily: "inherit", fontSize: "0.88rem",
                fontWeight: tab === t.id ? 600 : 400, textAlign: "left",
                transition: "background 0.12s, color 0.12s",
              }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--text3)",
              padding: "4px 16px",
              letterSpacing: "0.04em",
            }}
          >
            App Settings
          </div>
          <button
            onClick={() => setTab("privacy")}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 10px", borderRadius: "var(--radius)",
              border: "none", background: tab === "privacy" ? "var(--bg-hover)" : "none",
              color: tab === "privacy" ? "var(--text-primary)" : "var(--text-secondary)",
              cursor: "pointer", fontFamily: "inherit", fontSize: "0.88rem",
              fontWeight: tab === "privacy" ? 600 : 400, textAlign: "left",
              transition: "background 0.12s, color 0.12s",
              width: "100%",
            }}
          >
            <span>🔒</span>
            <span>Privacy</span>
          </button>
        </div>

        <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 10px", borderRadius: "var(--radius)",
              border: "none", background: "none",
              color: "var(--error)",
              cursor: "pointer", fontFamily: "inherit", fontSize: "0.88rem",
              textAlign: "left",
              opacity: 0.85,
              transition: "background 0.12s, opacity 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(237,66,69,0.12)"; e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.opacity = "0.85"; }}
          >
            <span>⇥</span>
            <span>Log Out</span>
          </button>
        </div>

        <div style={{ marginTop: "auto" }}>
          <button
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 10px", borderRadius: "var(--radius)",
              border: "none", background: "none",
              color: "var(--text-muted)", cursor: "pointer",
              fontFamily: "inherit", fontSize: "0.88rem",
              transition: "color 0.12s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            ← Назад
          </button>
          <div
            style={{
              marginTop: 6, paddingLeft: 8,
              fontSize: "0.72rem", color: "var(--text-muted)",
            }}
          >
            Esc — закрыть
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1, overflowY: "auto", padding: "32px 40px",
          background: "var(--bg-primary)",
        }}
      >
        {tab === "account" && currentUser && (
          <div style={{ maxWidth: 560 }}>
            <h3 style={{ marginBottom: 24, fontSize: "1.1rem", fontWeight: 700 }}>Аккаунт</h3>

            <div
              style={{
                background: "var(--bg-secondary)", borderRadius: "var(--radius)",
                border: "1px solid var(--border)", padding: 20, marginBottom: 16,
                display: "flex", alignItems: "center", gap: 16,
              }}
            >
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt="avatar"
                  style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                />
              ) : (
                <span
                  className="avatar"
                  style={{ width: 64, height: 64, fontSize: "1.5rem", flexShrink: 0 }}
                >
                  {(currentUser.display_name || currentUser.username)[0].toUpperCase()}
                </span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 2 }}>
                  {currentUser.display_name || currentUser.username}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  @{currentUser.username}
                </div>
                {currentUser.bio && (
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginTop: 6 }}>
                    {currentUser.bio}
                  </div>
                )}
              </div>
              <button
                className="btn-secondary"
                style={{ flexShrink: 0 }}
                onClick={() => setShowEditProfile(true)}
              >
                Изменить
              </button>
            </div>

            {[
              { label: "Юзернейм", value: `@${currentUser.username}` },
              { label: "Никнейм",  value: currentUser.display_name || "—" },
              { label: "O себе",   value: currentUser.bio || "—" },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 0", borderBottom: "1px solid var(--border)",
                  fontSize: "0.9rem",
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>{label}</span>
                <span style={{ color: "var(--text-primary)" }}>{value}</span>
              </div>
            ))}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 0",
                borderBottom: "1px solid var(--border)",
                fontSize: "0.9rem",
              }}
            >
              <div>
                <div style={{ color: "var(--text-muted)" }}>Password</div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginTop: 2 }}>
                  Last changed recently
                </div>
              </div>
              <button className="btn-secondary" style={{ margin: 0 }}>
                Change
              </button>
            </div>

            <div
              style={{
                marginTop: 18,
                paddingTop: 18,
                borderTop: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ color: "var(--error)", fontWeight: 700 }}>Log Out</div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 2 }}>
                  You will be returned to the login screen
                </div>
              </div>
              <button
                className="btn-secondary"
                style={{
                  margin: 0,
                  borderColor: "rgba(237,66,69,0.35)",
                  background: "rgba(237,66,69,0.12)",
                  color: "var(--error)",
                }}
                onClick={() => setShowLogoutConfirm(true)}
              >
                Log Out
              </button>
            </div>
          </div>
        )}

        {tab === "notifications" && (
          <div style={{ maxWidth: 560 }}>
            <h3 style={{ marginBottom: 24, fontSize: "1.1rem", fontWeight: 700 }}>Уведомления</h3>
            <div
              style={{
                background: "var(--bg-secondary)", borderRadius: "var(--radius)",
                border: "1px solid var(--border)", padding: 20,
                color: "var(--text-muted)", fontSize: "0.9rem", textAlign: "center",
              }}
            >
              🔔 Настройки уведомлений — в разработке
            </div>
          </div>
        )}

        {tab === "profile" && (
          <div style={{ maxWidth: 560 }}>
            <h3 style={{ marginBottom: 24, fontSize: "1.1rem", fontWeight: 700 }}>Profile</h3>
            <div
              style={{
                background: "var(--bg-secondary)", borderRadius: "var(--radius)",
                border: "1px solid var(--border)", padding: 20,
                color: "var(--text-muted)", fontSize: "0.9rem", textAlign: "center",
              }}
            >
              🪪 Profile settings — work in progress
            </div>
          </div>
        )}

        {tab === "appearance" && (
          <div style={{ maxWidth: 560 }}>
            <h3 style={{ marginBottom: 24, fontSize: "1.1rem", fontWeight: 700 }}>Внешний вид</h3>

            <div
              style={{
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                padding: 20,
                marginBottom: 16,
              }}
            >
              <div style={{ marginBottom: 12, fontWeight: 600, fontSize: "0.9rem" }}>Тема</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "12px",
                }}
              >
                {(["dark", "light", "amoled", "midnight"] as Theme[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    style={{
                      padding: "12px",
                      border: "2px solid",
                      borderColor: theme === t ? "var(--accent)" : "transparent",
                      background: "var(--bg-tertiary)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "border-color 0.15s, transform 0.1s",
                      outline: "none",
                      color: "inherit",
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                  >
                    <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "0.85rem" }}>
                      {themeLabels[t]}
                    </div>
                    {/* Theme Preview Box */}
                    <div
                      style={{
                        height: "60px",
                        background:
                          t === "dark"
                            ? "#0E1621"
                            : t === "light"
                            ? "#F6F7F9"
                            : t === "amoled"
                            ? "#000000"
                            : "#0A0F1C",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {/* Sidebar Preview */}
                      <div
                        style={{
                          position: "absolute",
                          left: 0, top: 0, bottom: 0,
                          width: "30%",
                          background:
                            t === "dark"
                              ? "#17212B"
                              : t === "light"
                              ? "#FFFFFF"
                              : t === "amoled"
                              ? "#0A0A0A"
                              : "#111827",
                          borderRight: "1px solid rgba(255,255,255,0.05)",
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-secondary)", borderRadius: "var(--radius)",
                border: "1px solid var(--border)", padding: 20,
                color: "var(--text-muted)", fontSize: "0.9rem", textAlign: "center",
              }}
            >
              🎨 Дополнительные опции — в разработке
            </div>
          </div>
        )}

        {tab === "audioVideo" && (
          <div style={{ maxWidth: 560 }}>
            <h3 style={{ marginBottom: 24, fontSize: "1.1rem", fontWeight: 700 }}>Audio &amp; Video</h3>
            <div
              style={{
                background: "var(--bg-secondary)", borderRadius: "var(--radius)",
                border: "1px solid var(--border)", padding: 20,
                color: "var(--text-muted)", fontSize: "0.9rem", textAlign: "center",
              }}
            >
              🎙️ Audio and video settings — work in progress
            </div>
          </div>
        )}

        {tab === "privacy" && (
          <div style={{ maxWidth: 560 }}>
            <h3 style={{ marginBottom: 24, fontSize: "1.1rem", fontWeight: 700 }}>Privacy</h3>
            <div
              style={{
                background: "var(--bg-secondary)", borderRadius: "var(--radius)",
                border: "1px solid var(--border)", padding: 20,
                color: "var(--text-muted)", fontSize: "0.9rem", textAlign: "center",
              }}
            >
              🔒 Privacy settings — work in progress
            </div>
          </div>
        )}
      </div>

      {showEditProfile && currentUser && (
        <ProfileModal
          user={currentUser}
          onClose={() => setShowEditProfile(false)}
        />
      )}

      {showLogoutConfirm && (
        <ConfirmModal
          title="Log out of Vetra?"
          message="You will need to log back in to access your messages."
          confirmLabel="Log Out"
          cancelLabel="Cancel"
          isDanger
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={() => {
            setShowLogoutConfirm(false);
            logout();
            onClose();
          }}
        />
      )}
    </div>
  );
}
