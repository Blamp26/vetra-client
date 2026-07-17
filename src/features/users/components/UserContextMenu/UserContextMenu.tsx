import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Menu, MenuItem, MenuSeparator } from "@/shared/components/Menu";
import type { ResourceRef } from "@/shared/types";

export type UserContextTarget = { id: ResourceRef; username: string; displayName?: string | null; avatarUrl?: string | null; kind: "self" | "remote" };
type Props = { target: UserContextTarget; x: number; y: number; anchorRect?: DOMRect | null; onClose: () => void; onProfile?: () => void; onHangUp?: () => void; volume: number; muted: boolean; onVolumeChange: (volume: number) => void; onMutedChange: (muted: boolean) => void };

export function UserContextMenu({ target, x, y, anchorRect, onClose, onProfile, onHangUp, volume, muted, onVolumeChange, onMutedChange }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: Math.max(8, x), top: Math.max(8, y) });
  const [active, setActive] = useState("profile");

  useEffect(() => {
    const measure = () => {
      const rect = menuRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 8;
      const preferredX = anchorRect ? anchorRect.left : x;
      const preferredY = anchorRect ? anchorRect.bottom : y;
      const left = Math.max(margin, Math.min(preferredX, window.innerWidth - rect.width - margin));
      const below = preferredY + rect.height;
      const top = below > window.innerHeight - margin && anchorRect
        ? anchorRect.top - rect.height
        : preferredY;
      setPosition({ left, top: Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin)) });
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", onClose); window.removeEventListener("blur", onClose); };
  }, [anchorRect, onClose, x, y, target.id]);

  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("contextmenu", outside);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("contextmenu", outside); };
  }, [onClose]);

  const openProfile = () => { onClose(); onProfile?.(); };
  const menu = <Menu ref={menuRef} className="vt-user-context-menu" style={{ left: position.left, top: position.top }} data-testid="user-context-menu" activeValue={active} onActiveValueChange={setActive} onEscape={onClose} autoFocus>
    <MenuItem value="profile" onSelect={openProfile}>View profile</MenuItem>
    {target.kind === "remote" && <MenuItem value="stop-call" onSelect={() => { onClose(); onHangUp?.(); }}>Stop call</MenuItem>}
    {target.kind === "remote" && <><MenuSeparator /><div className="vt-user-context-menu__volume"><label htmlFor="user-volume">User volume <output>{volume}%</output></label><input id="user-volume" aria-label="User volume" type="range" min="0" max="100" step="1" value={volume} onChange={(event) => onVolumeChange(Number(event.target.value))} /></div><MenuItem value="mute-user" onSelect={() => { onMutedChange(!muted); onClose(); }}>{muted ? "Unmute user" : "Mute user"}</MenuItem></>}
    {target.kind === "remote" && <MenuSeparator />}
    <MenuItem value="copy-id" onSelect={() => { void Promise.resolve().then(() => navigator.clipboard?.writeText(String(target.id)) ?? Promise.reject(new Error("Clipboard unavailable"))).then(() => { window.dispatchEvent(new CustomEvent("vetra:toast", { detail: { title: "User ID copied", body: String(target.id), durationMs: 3000 } })); onClose(); }).catch(() => window.dispatchEvent(new CustomEvent("vetra:toast", { detail: { title: "Could not copy user ID", body: "Clipboard access was unavailable.", durationMs: 4000 } }))); }}>Copy user ID</MenuItem>
  </Menu>;
  return <>{typeof document !== "undefined" && createPortal(menu, document.body)}</>;
}
