import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { roomsApi } from "@/api/rooms";
import { postFormData } from "@/api/base";
import { Avatar } from "@/shared/components/Avatar";
import { TextInput } from "@/shared/components/Field";
import type { RoomPreview } from "@/shared/types";
import { roomRef } from "@/shared/utils/refs";
import { useAppStore, type RootState } from "@/store";
import {
  GROUP_AVATAR_MAX_UPLOAD_SIZE,
  GROUP_AVATAR_TYPES,
  isSupportedGroupAvatar,
} from "./AvatarCropDialog";

export interface GroupBasicInfoDraft {
  name: string;
  description: string;
  avatarMediaFileId: string | null;
  avatarPreviewUrl: string | null;
  avatarBlob: Blob | null;
  uploadedMediaId: string | null;
}

export interface GroupBasicInfoController {
  draft: GroupBasicInfoDraft;
  cropSource: Blob | null;
  setCropSource: (source: Blob | null) => void;
  avatarMenuOpen: boolean;
  setAvatarMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  nameTouched: boolean;
  setNameTouched: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  saving: boolean;
  stage: "idle" | "uploading" | "saving";
  nameError: string | null;
  dirty: boolean;
  saveDisabled: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  editorRef: React.RefObject<HTMLDivElement>;
  chooseFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  pasteFromClipboard: () => Promise<void>;
  removePhoto: () => void;
  replacePreview: (blob: Blob) => void;
  setDraft: React.Dispatch<React.SetStateAction<GroupBasicInfoDraft>>;
  save: () => Promise<void>;
}

export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 500;

function initialDraft(room: RoomPreview): GroupBasicInfoDraft {
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
    if (typeof image.decode === "function") await image.decode();
    else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("That image could not be decoded."));
      });
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useGroupBasicInfoEditor({
  room,
  onClose,
}: {
  room: RoomPreview;
  onClose: () => void;
}): GroupBasicInfoController {
  const fileInputRef = useRef<HTMLInputElement>(null!);
  const editorRef = useRef<HTMLDivElement>(null!);
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

  const prepareImage = async (file: File | Blob) => {
    if (!isSupportedGroupAvatar({ type: file.type, size: file.size })) {
      setError(file.size > GROUP_AVATAR_MAX_UPLOAD_SIZE
        ? "Image must be 15 MB or smaller."
        : `Use ${GROUP_AVATAR_TYPES.map((type) => type.replace("image/", "").toUpperCase()).join(", ")} images.`);
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
    const editor = editorRef.current;
    editor?.addEventListener("paste", onPaste);
    return () => editor?.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (draft.avatarPreviewUrl) URL.revokeObjectURL(draft.avatarPreviewUrl);
  }, [draft.avatarPreviewUrl]);

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
          await prepareImage(await item.getType(type));
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
      return { ...current, avatarMediaFileId: null, avatarPreviewUrl: URL.createObjectURL(blob), avatarBlob: blob, uploadedMediaId: null };
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
  const normalizedDescription = draft.description.trim() || null;
  const dirty = draft.name.trim() !== room.name.trim()
    || normalizedDescription !== (room.description?.trim() || null)
    || draft.avatarBlob !== null
    || draft.avatarMediaFileId !== (room.avatar_media_file_id ?? null);

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
      } else if (draft.uploadedMediaId) avatarMediaFileId = draft.uploadedMediaId;
      setStage("saving");
      const updated = await roomsApi.updateProfile(roomRef(room) ?? room.id, {
        name: draft.name.trim(),
        description: normalizedDescription,
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

  return {
    draft, cropSource, setCropSource, avatarMenuOpen, setAvatarMenuOpen,
    nameTouched, setNameTouched, error, saving, stage, nameError, dirty,
    saveDisabled: saving || Boolean(nameError) || !dirty,
    fileInputRef, editorRef, chooseFile, pasteFromClipboard, removePhoto,
    replacePreview, setDraft, save,
  };
}

export function GroupBasicInfoFields({
  room,
  titleId,
  descriptionId,
  controller,
}: {
  room: RoomPreview;
  titleId: string;
  descriptionId: string;
  controller: GroupBasicInfoController;
}) {
  const { draft, avatarMenuOpen, setAvatarMenuOpen, fileInputRef, chooseFile, pasteFromClipboard, removePhoto, nameTouched, setNameTouched, nameError, error, setDraft } = controller;
  return (
    <>
      <section aria-labelledby={`${titleId}-identity`} className="space-y-3 px-5 py-4">
        <h3 id={`${titleId}-identity`} className="sr-only">Group identity</h3>
        <div className="flex items-start gap-5">
          <div className="relative">
            <button type="button" aria-label="Change group photo" className="group relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={() => setAvatarMenuOpen((open) => !open)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setAvatarMenuOpen((open) => !open); } }}>
              {draft.avatarPreviewUrl ? <img src={draft.avatarPreviewUrl} alt="Group avatar preview" className="h-full w-full object-cover" /> : <Avatar name={draft.name} src={draft.avatarMediaFileId ? room.avatar_url ?? null : null} size="large" className="h-full w-full rounded-full text-xl" />}
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-black/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera className="h-5 w-5 text-white" aria-hidden="true" />
              </span>
            </button>
            {avatarMenuOpen && <div role="menu" className="absolute left-0 top-[70px] z-10 w-48 rounded-lg border border-border bg-card p-1 shadow-lg">
              <button type="button" role="menuitem" className="flex w-full items-center rounded px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => fileInputRef.current?.click()}>Choose from file</button>
              <button type="button" role="menuitem" className="flex w-full items-center rounded px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => void pasteFromClipboard()}>Paste from clipboard</button>
              {(room.avatar_media_file_id || draft.avatarPreviewUrl) && <button type="button" role="menuitem" className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-destructive hover:bg-accent" onClick={removePhoto}>Remove photo</button>}
            </div>}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <label className="block text-[11px] leading-none text-muted-foreground" htmlFor={`${titleId}-name`}>Group name</label>
            <TextInput id={`${titleId}-name`} value={draft.name} maxLength={MAX_NAME_LENGTH} invalid={Boolean(nameTouched && nameError)} size="compact" className="!rounded-none !border-0 !border-b !border-border !bg-transparent !px-0 !py-1 !shadow-none focus:!border-primary focus:!ring-0" onBlur={() => setNameTouched(true)} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} aria-describedby={nameTouched && nameError ? `${titleId}-name-error` : undefined} />
            {nameTouched && nameError && <p id={`${titleId}-name-error`} role="alert" className="text-[11px] leading-tight text-destructive">{nameError}</p>}
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept={GROUP_AVATAR_TYPES.join(",")} className="hidden" onChange={chooseFile} />
        <div className="space-y-1">
          <label className="block text-[11px] leading-none text-muted-foreground" htmlFor={descriptionId}>Description</label>
          <textarea id={descriptionId} value={draft.description} maxLength={MAX_DESCRIPTION_LENGTH} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className="vt-input !min-h-0 w-full resize-none !rounded-none !border-0 !border-b !border-border !bg-transparent !px-0 !py-1.5 text-sm !shadow-none focus:!border-primary focus:!ring-0" placeholder="Add a description" rows={draft.description ? Math.min(3, Math.max(1, draft.description.split("\n").length)) : 1} />
          {draft.description.length >= MAX_DESCRIPTION_LENGTH - 50 && <p className="text-right text-[10px] text-muted-foreground">{draft.description.length}/{MAX_DESCRIPTION_LENGTH}</p>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </section>
    </>
  );
}
