import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Volume2 } from "lucide-react";
import { Menu, MenuItem, MenuSeparator } from "@/shared/components/Menu";
import type { ResourceRef } from "@/shared/types";

export type UserContextInvocation =
  | { mode: "pointer"; clientX: number; clientY: number }
  | { mode: "keyboard"; anchorRect: DOMRect };
export type UserContextTarget = { profileId: ResourceRef; copyId: string | number; audioPreferenceKey?: string; username: string; displayName?: string | null; avatarUrl?: string | null; kind: "self" | "remote" };
type Props = { target: UserContextTarget; invocation: UserContextInvocation; onClose: () => void; onProfile?: () => void; onNote?: () => void; volume: number; muted: boolean; note?: string; onVolumeChange: (volume: number) => void; onMutedChange: (muted: boolean) => void; onCopyUsername: () => void; onCopyId: () => void };

export function UserContextMenu({ target, invocation, onClose, onProfile, onNote, volume, muted, note, onVolumeChange, onMutedChange, onCopyUsername, onCopyId }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const [active, setActive] = useState("profile");

  useEffect(() => {
    const measure = () => {
      const rect = menuRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 8;
      const preferredX = invocation.mode === "pointer" ? invocation.clientX + 8 : invocation.anchorRect.right + 8;
      const preferredY = invocation.mode === "pointer" ? invocation.clientY - 8 : invocation.anchorRect.top;
      const shouldFlipLeft = preferredX + rect.width > window.innerWidth - margin;
      const horizontal = shouldFlipLeft
        ? (invocation.mode === "pointer" ? invocation.clientX - rect.width - 8 : invocation.anchorRect.left - rect.width - 8)
        : preferredX;
      const top = preferredY;
      setPosition({ left: Math.max(margin, Math.min(horizontal, window.innerWidth - rect.width - margin)), top: Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin)) });
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", onClose); window.removeEventListener("blur", onClose); };
  }, [invocation, onClose, target.profileId]);

  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("contextmenu", outside);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("contextmenu", outside); };
  }, [onClose]);

  const openProfile = () => { onClose(); onProfile?.(); };
  const menu = <Menu ref={menuRef} className="vt-user-context-menu" style={{ left: position.left, top: position.top }} data-testid="user-context-menu" activeValue={active} onActiveValueChange={setActive} onEscape={onClose} autoFocus>
    <MenuItem value="profile" onSelect={openProfile}>View profile</MenuItem>
    {target.kind === "remote" && <MenuItem value="note" onSelect={onNote}>{note ? "Edit note" : "Add note"}</MenuItem>}
    {target.kind === "remote" && <><MenuSeparator /><div className="vt-user-context-menu__volume"><label htmlFor="user-volume"><span className="inline-flex items-center gap-1"><Volume2 className="h-3.5 w-3.5" aria-hidden="true" />User volume</span><output>{volume}%</output></label><input id="user-volume" aria-label="User volume" type="range" min="0" max="100" step="1" value={volume} onChange={(event) => onVolumeChange(Number(event.target.value))} /></div><MenuItem value="mute-user" aria-checked={muted} onSelect={() => onMutedChange(!muted)}>{muted && <Check className="mr-2 inline h-4 w-4" aria-hidden="true" />}Mute user</MenuItem></>}
    {target.kind === "remote" && <MenuSeparator />}
    <MenuItem value="copy-username" onSelect={onCopyUsername}><Copy className="mr-2 inline h-3.5 w-3.5" aria-hidden="true" />Copy username</MenuItem>
    <MenuItem value="copy-id" onSelect={onCopyId}><Copy className="mr-2 inline h-3.5 w-3.5" aria-hidden="true" />Copy user ID</MenuItem>
  </Menu>;
  return <>{typeof document !== "undefined" && createPortal(menu, document.body)}</>;
}
