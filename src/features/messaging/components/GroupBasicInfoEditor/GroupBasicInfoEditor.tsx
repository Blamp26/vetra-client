import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { roomsApi } from "@/api/rooms";
import { postFormData } from "@/api/base";
import { Avatar } from "@/shared/components/Avatar";
import { Button } from "@/shared/components/Button";
import { Dialog } from "@/shared/components/Dialog";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";
import type { RoomPreview } from "@/shared/types";
import { roomRef } from "@/shared/utils/refs";
import { useAppStore, type RootState } from "@/store";
import {
  AvatarCropDialog,
  GROUP_AVATAR_MAX_UPLOAD_SIZE,
  GROUP_AVATAR_TYPES,
  isSupportedGroupAvatar,
} from "./AvatarCropDialog";

interface Props {
  room: RoomPreview;
  onClose: () => void;
}

interface Draft {
  name: string;
  description: string;
  avatarMediaFileId: string | null;
  avatarPreviewUrl: string | null;
  avatarBlob: Blob | null;
  uploadedMediaId: string | null;
}

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

function initialDraft(room: RoomPreview): Draft {
  return {
    name: room.name.trim(),
    description: room.description?.trim() ?? "",
    avatarMediaFileId: room.avatar_media_file_id ?? null,
    avatarPreviewUrl: null,
    avatarBlob: null,
    uploadedMediaId: null,
  };
}

function displayError(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

async function decodeImageBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("That image could not be decoded."));
      });
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function GroupBasicInfoEditor({ room, onClose }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const roomIdentityRef = useRef(`${room.id}:${room.public_id ?? ""}`);
  const updateRoomPreview = useAppStore((state: RootState) => state.upsertRoomPreview);
  const [draft, setDraft] = useState(() => initialDraft(room));
  const [cropSource, setCropSource] = useState<Blob | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<"idle" | "uploading" | "saving">("idle");

  useEffect(() => {
    const identity = `${room.id}:${room.public_id ?? ""}`;
    if (roomIdentityRef.current !== identity) onClose();
  }, [onClose, room.id, room.public_id]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((candidate) =>
        GROUP_AVATAR_TYPES.includes(candidate.type as (typeof GROUP_AVATAR_TYPES)[number]),
      );
      if (!item) return;
      event.preventDefault();
      const blob = item.getAsFile();
      if (blob) void prepareImage(blob);
    };
    const prepareImage = async (blob: Blob) => {
      if (!isSupportedGroupAvatar({ type: blob.type, size: blob.size })) {
        setError(blob.size > GROUP_AVATAR_MAX_UPLOAD_SIZE ? "Image must be 15 MB or smaller." : "Use a PNG, JPEG, GIF, or WebP image.");
        return;
      }
      try {
        await decodeImageBlob(blob);
        setError(null);
        setCropSource(blob);
      } catch {
        setError("That image could not be decoded.");
      }
    };
    const editor = editorRef.current;
    editor?.addEventListener("paste", onPaste);
    return () => editor?.removeEventListener("paste", onPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (draft.avatarPreviewUrl) URL.revokeObjectURL(draft.avatarPreviewUrl);
  }, [draft.avatarPreviewUrl]);

  const prepareImage = async (file: File | Blob) => {
    if (!isSupportedGroupAvatar({ type: file.type, size: file.size })) {
      setError(file.size > GROUP_AVATAR_MAX_UPLOAD_SIZE ? "Image must be 15 MB or smaller." : `Use ${GROUP_AVATAR_TYPES.map((type) => type.replace("image/", "").toUpperCase()).join(", ")} images.`);
      return;
    }
    try {
      await decodeImageBlob(file);
      setError(null);
      setCropSource(file);
    } catch {
      setError("That image could not be decoded.");
    }
  };

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setAvatarMenuOpen(false);
    if (file) void prepareImage(file);
  };

  const pasteFromClipboard = async () => {
    setAvatarMenuOpen(false);
    try {
      if (!navigator.clipboard?.read) {
        setError("Clipboard image access is unavailable. Focus this editor and paste an image.");
        editorRef.current?.focus();
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = GROUP_AVATAR_TYPES.find((candidate) => item.types.includes(candidate));
        if (type) {
          const blob = await item.getType(type);
          await prepareImage(blob);
          return;
        }
      }
      setError("The clipboard does not contain a supported image.");
    } catch (reason) {
      setError(displayError(reason, "Clipboard permission was denied or unavailable."));
    }
  };

  const replacePreview = (blob: Blob) => {
    setDraft((current) => {
      if (current.avatarPreviewUrl) URL.revokeObjectURL(current.avatarPreviewUrl);
      return {
        ...current,
        avatarMediaFileId: null,
        avatarPreviewUrl: URL.createObjectURL(blob),
        avatarBlob: blob,
        uploadedMediaId: null,
      };
    });
    setCropSource(null);
  };

  const removePhoto = () => {
    setAvatarMenuOpen(false);
    setDraft((current) => {
      if (current.avatarPreviewUrl) URL.revokeObjectURL(current.avatarPreviewUrl);
      return { ...current, avatarMediaFileId: null, avatarPreviewUrl: null, avatarBlob: null, uploadedMediaId: null };
    });
  };

  const nameError = draft.name.trim().length === 0
    ? "Group name is required."
    : draft.name.trim().length > MAX_NAME_LENGTH
      ? `Group name must be ${MAX_NAME_LENGTH} characters or fewer.`
      : null;

  const save = async () => {
    setNameTouched(true);
    setError(null);
    if (nameError) return;
    const identity = roomIdentityRef.current;
    setSaving(true);
    try {
      let avatarMediaFileId = draft.avatarMediaFileId;
      if (draft.avatarBlob && !draft.uploadedMediaId) {
        setStage("uploading");
        const form = new FormData();
        form.append("file", draft.avatarBlob, "group-avatar.png");
        const uploaded = await postFormData<{ media_file_id: string }>("/media", form);
        if (roomIdentityRef.current !== identity) return;
        avatarMediaFileId = uploaded.media_file_id;
        setDraft((current) => ({ ...current, uploadedMediaId: uploaded.media_file_id }));
      } else if (draft.uploadedMediaId) {
        avatarMediaFileId = draft.uploadedMediaId;
      }
      setStage("saving");
      const updated = await roomsApi.updateProfile(roomRef(room) ?? room.id, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        avatar_media_file_id: avatarMediaFileId,
      });
      if (roomIdentityRef.current !== identity) return;
      updateRoomPreview(updated);
      onClose();
    } catch (reason) {
      if (roomIdentityRef.current === identity) setError(displayError(reason, "Could not save group information."));
    } finally {
      if (roomIdentityRef.current === identity) {
        setSaving(false);
        setStage("idle");
      }
    }
  };

  return (
    <>
      <Dialog open onClose={onClose} labelledBy={titleId} initialFocusRef={editorRef} className="w-[min(430px,calc(100vw-32px))] max-h-[calc(100vh-32px)] overflow-hidden rounded-xl p-0">
        <div ref={editorRef} tabIndex={-1} className="flex max-h-[calc(100vh-32px)] min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-border px-[22px] py-4">
            <h2 id={titleId} className="text-base font-semibold">Edit group</h2>
            <IconButton label="Close edit group" size="compact" onClick={onClose}><X className="h-4 w-4" aria-hidden="true" /></IconButton>
          </div>
          <div className="min-h-0 overflow-y-auto">
            <div className="h-2 border-y border-border bg-muted/30" aria-hidden="true" />
            <section aria-labelledby={`${titleId}-basic`} className="space-y-4 px-[22px] py-5">
              <h3 id={`${titleId}-basic`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basic information</h3>
              <div className="flex items-center gap-3">
                <div className="relative">
                  {draft.avatarPreviewUrl ? <img src={draft.avatarPreviewUrl} alt="Group avatar preview" className="h-20 w-20 rounded-full border border-border object-cover" /> : <Avatar name={draft.name} src={draft.avatarMediaFileId ? room.avatar_url ?? null : null} size="large" className="h-20 w-20 text-2xl" />}
                  <button type="button" aria-label="Change group photo" className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-accent" onClick={() => setAvatarMenuOpen((open) => !open)}><ImagePlus className="h-4 w-4" aria-hidden="true" /></button>
                  {avatarMenuOpen && (
                    <div role="menu" className="absolute left-0 top-[86px] z-10 w-48 rounded-lg border border-border bg-card p-1 shadow-lg">
                      <button type="button" role="menuitem" className="flex w-full items-center rounded px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => fileInputRef.current?.click()}>Choose from file</button>
                      <button type="button" role="menuitem" className="flex w-full items-center rounded px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => void pasteFromClipboard()}>Paste from clipboard</button>
                      {(room.avatar_media_file_id || draft.avatarPreviewUrl) && <button type="button" role="menuitem" className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-destructive hover:bg-accent" onClick={removePhoto}>Remove photo</button>}
                    </div>
                  )}
                </div>
                <div className="min-w-0"><p className="text-sm font-medium">Group photo</p><p className="text-xs text-muted-foreground">PNG, JPEG, GIF, or WebP · up to 15 MB</p></div>
              </div>
              <input ref={fileInputRef} type="file" accept={GROUP_AVATAR_TYPES.join(",")} className="hidden" onChange={chooseFile} />
              <div className="space-y-1">
                <label className="vt-label" htmlFor={`${titleId}-name`}>Group name</label>
                <TextInput id={`${titleId}-name`} value={draft.name} maxLength={MAX_NAME_LENGTH} invalid={Boolean(nameTouched && nameError)} onBlur={() => setNameTouched(true)} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} aria-describedby={nameTouched && nameError ? `${titleId}-name-error` : undefined} />
                {nameTouched && nameError && <p id={`${titleId}-name-error`} role="alert" className="text-xs text-destructive">{nameError}</p>}
              </div>
              <div className="space-y-1">
                <label className="vt-label" htmlFor={descriptionId}>Description</label>
                <textarea id={descriptionId} value={draft.description} maxLength={MAX_DESCRIPTION_LENGTH} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className="vt-input min-h-24 w-full resize-y py-2" placeholder="Add a description" />
                <p className="text-right text-xs text-muted-foreground">{draft.description.length}/{MAX_DESCRIPTION_LENGTH}</p>
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </section>
          </div>
          <div className="flex items-center justify-between border-t border-border px-[22px] py-3">
            <span className="text-xs text-muted-foreground" role="status">{stage === "uploading" ? "Uploading photo…" : stage === "saving" ? "Saving…" : ""}</span>
            <div className="flex gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button type="button" variant="primary" loading={saving} onClick={() => void save()}>Save</Button></div>
          </div>
        </div>
      </Dialog>
      {cropSource && <AvatarCropDialog source={cropSource} onCancel={() => setCropSource(null)} onSetPhoto={replacePreview} />}
    </>
  );
}
