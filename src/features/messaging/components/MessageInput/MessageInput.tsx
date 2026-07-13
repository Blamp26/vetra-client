import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from "react";
import { Check, FileText, ImagePlus, Mic, Paperclip, SendHorizonal, Square, X } from "lucide-react";
import { useAppStore, type RootState } from "@/store"; 
import { API_BASE_URL } from "@/api/base";
import { cn } from "@/shared/utils/cn";
import { EmojiText } from "@/shared/components/Emoji/Emoji";
import { withFallbackRef } from "@/shared/utils/refs";
import { isSafeExternalUrl } from "@/shared/utils/externalLinks";
import { entitiesIntersectingRange, normalizeTextLinkEntities, transformTextLinkEntities, trimTextAndEntities, type TextLinkEntity } from "@/shared/utils/textEntities";
import {
  ALLOWED_ATTACHMENT_LABEL,
  classifyPendingAttachment,
  extractAudioDurationMs,
  MESSAGE_FILE_ATTACHMENT_ACCEPT,
  MESSAGE_MEDIA_ATTACHMENT_ACCEPT,
  validateAttachmentFile,
} from "../../utils/attachments";
import { AttachmentReviewModal } from "./AttachmentReviewModal";
import {
  AttachmentUploadError,
  buildAttachmentSendUnits,
  getAttachmentSendUnitType,
  parseRetryAfterMs,
  uploadAttachmentsBounded,
  type PendingAttachment,
} from "./attachmentQueue";
import {
  createVoiceRecordingFile,
  formatVoiceDuration,
  selectVoiceRecordingMimeType,
} from "../../utils/voiceRecording";
import {
  createAttachmentBatchId,
  createAttachmentSendUnitId,
  isAttachmentDebugEnabled,
  logAttachmentDebug,
  summarizeAttachmentLike,
  summarizeUnknownShape,
  type AttachmentDebugMeta,
} from "../../utils/attachmentDebug";

type AttachmentMenuPlacement = "composer" | "modal";

function AttachmentSourceMenu({
  placement,
  onClose,
  onSelectMedia,
  onSelectFile,
}: {
  placement: AttachmentMenuPlacement;
  onClose: () => void;
  onSelectMedia: () => void;
  onSelectFile: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      window.setTimeout(onClose, 0);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className={cn(
        "vt-attachment-review__menu absolute z-40 p-1.5",
        placement === "composer" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2",
      )}
      data-testid="attachment-source-menu"
      role="menu"
    >
      <button
        type="button"
        className="vt-attachment-review__menu-item flex w-full items-center gap-3 px-3 py-2 text-left text-[14px] font-medium transition"
        onClick={() => {
          onSelectMedia();
          onClose();
        }}
        role="menuitem"
      >
        <ImagePlus className="vt-attachment-review__menu-icon h-4 w-4" />
        <span>Photo or Video</span>
      </button>
      <button
        type="button"
        className="vt-attachment-review__menu-item mt-0.5 flex w-full items-center gap-3 px-3 py-2 text-left text-[14px] font-medium transition"
        onClick={() => {
          onSelectFile();
          onClose();
        }}
        role="menuitem"
      >
        <FileText className="vt-attachment-review__menu-icon h-4 w-4" />
        <span>File</span>
      </button>
    </div>
  );
}

function LinkEditor({
  url,
  invalid,
  onChange,
  onSave,
  onCancel,
}: {
  url: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="absolute bottom-full left-1/2 z-50 flex h-12 w-[422px] max-w-[calc(100vw-12px)] -translate-x-1/2 items-center rounded-[15px] bg-[#212121] px-[6px] py-2 shadow-[rgba(16,16,16,0.61)_0_1px_2px]"
      data-testid="message-link-editor"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" className="mx-0.5 flex h-8 w-8 items-center justify-center rounded-[6px] p-1 text-[#aaa] hover:bg-white/10" aria-label="Cancel" onClick={onCancel}>
        <X className="h-4 w-4" />
      </button>
      <span className="mx-1 h-7 w-px bg-[#303030]" />
      <input
        autoFocus
        value={url}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); onSave(); }
          if (event.key === "Escape") { event.preventDefault(); onCancel(); }
        }}
        className="h-[26px] w-[320px] border-0 bg-[#212121] px-0.5 py-px text-base font-normal leading-6 text-white outline-none"
        placeholder="Enter URL..."
        aria-label="URL"
        data-testid="message-link-url"
      />
      <span className="mx-1 h-7 w-px bg-[#303030]" />
      <button type="button" className="mx-0.5 flex h-8 w-8 items-center justify-center rounded-[6px] p-1 text-[#8774e1] hover:bg-white/10" aria-label="Save" onClick={onSave}>
        <Check className="h-4 w-4" />
      </button>
      {invalid && <span className="sr-only">Invalid URL</span>}
    </div>
  );
}

interface ReplyTarget { id: number; content: string; author: string; }

interface Props {
  onSend: (
    payload: {
      content?: string | null;
      mediaFileId?: string | null;
      mediaFileIds?: string[] | null;
      entities?: TextLinkEntity[];
      __attachmentDebug?: AttachmentDebugMeta | null;
    },
    replyToId?: number,
  ) => Promise<void>; 
   onTypingStart?: () => void; 
   onTypingStop?: () => void; 
   disabled?: boolean; 
   replyTo?: ReplyTarget | null; 
   onCancelReply?: () => void; 
   focusBlocked?: boolean;
 } 
 
 export function MessageInput({ 
   onSend, 
   onTypingStart, 
   onTypingStop, 
   disabled = false, 
   replyTo, 
   onCancelReply, 
   focusBlocked = false,
 }: Props) { 
   const [content, setContent] = useState("");
  const [entities, setEntities] = useState<TextLinkEntity[]>([]);
  const [linkEditor, setLinkEditor] = useState<{ start: number; end: number } | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkInvalid, setLinkInvalid] = useState(false);
   const [isSending, setIsSending] = useState(false); 
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [voiceRecordingState, setVoiceRecordingState] = useState<"idle" | "recording" | "processing">("idle");
  const [voiceElapsedMs, setVoiceElapsedMs] = useState(0);
  const [isComposerAttachmentMenuOpen, setIsComposerAttachmentMenuOpen] = useState(false);
  const [isModalAttachmentMenuOpen, setIsModalAttachmentMenuOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);

   const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentIdRef = useRef(0);
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);
  const sendLockRef = useRef(false);
  const attachmentBatchIdRef = useRef<string | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadedMediaFileIdsRef = useRef(new Map<string, string>());
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceStartedAtRef = useRef(0);
  const voiceDiscardRef = useRef(false);
  const voiceSendLockRef = useRef(false);
 
   const editingMessage = useAppStore((s: RootState) => s.editingMessage); 
   const cancelEditing = useAppStore((s: RootState) => s.cancelEditing); 
  const socketManager = useAppStore((s: RootState) => s.socketManager); 
  const activeChat = useAppStore((s: RootState) => s.activeChat); 
  const conversationPreviews = useAppStore((s: RootState) => s.conversationPreviews);
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const authToken = useAppStore((s: RootState) => s.authToken);
 
   const isEditing = !!editingMessage; 
  const isUploading = uploadStatus === "uploading";
  const activeChatKey = activeChat
    ? activeChat.type === "direct"
      ? `direct:${activeChat.partnerId}`
      : activeChat.type === "room"
        ? `room:${activeChat.roomId}`
        : activeChat.type
    : null;
 
   useEffect(() => { 
     if (isEditing && editingMessage) { 
       setContent(editingMessage.content);
       setEntities(normalizeTextLinkEntities(editingMessage.entities, editingMessage.content));
       setTimeout(() => { 
         textareaRef.current?.focus(); 
       }, 10); 
     } else if (!isEditing) { 
       setContent("");
       setEntities([]);
     } 
   }, [isEditing, editingMessage]); 
 
  useEffect(() => { 
    if (editingMessage && activeChat) { 
      const sameChat = 
        (editingMessage.chatType === 'direct' && 
         activeChat.type === 'direct' && 
         editingMessage.targetId === activeChat.partnerId) || 
        (editingMessage.chatType === 'room' && 
         activeChat.type === 'room' && 
         editingMessage.targetId === activeChat.roomId); 

      if (!sameChat) cancelEditing(); 
    } 
  }, [activeChat, editingMessage, cancelEditing]); 

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    if (!linkEditor) return;
    const handleOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (target instanceof Element && target.closest('[data-testid="message-link-editor"]')) return;
      setLinkEditor(null);
    };
    document.addEventListener("mousedown", handleOutsidePointer);
    return () => document.removeEventListener("mousedown", handleOutsidePointer);
  }, [linkEditor]);

  useEffect(() => {
    if (pendingAttachments.length === 0) {
      setIsModalAttachmentMenuOpen(false);
    }
  }, [pendingAttachments.length]);

  useEffect(() => {
    if (!disabled && !isSending && !isUploading && !isEditing && voiceRecordingState === "idle") return;
    setIsComposerAttachmentMenuOpen(false);
    setIsModalAttachmentMenuOpen(false);
  }, [disabled, isEditing, isSending, isUploading, voiceRecordingState]);

  useEffect(() => {
    logAttachmentDebug("modal.state", {
      isOpen: pendingAttachments.length > 0,
      itemCount: pendingAttachments.length,
      photoCount: pendingAttachments.filter((attachment) => attachment.kind === "photo").length,
      documentCount: pendingAttachments.filter((attachment) => attachment.kind !== "photo").length,
    }, {
      batchId: attachmentBatchIdRef.current,
      table: pendingAttachments.map((attachment) => summarizeAttachmentLike(attachment)),
    });
  }, [pendingAttachments]);

  useEffect(() => {
    return () => {
      uploadAbortControllerRef.current?.abort();
      voiceDiscardRef.current = true;
      voiceRecorderRef.current?.stop();
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceRecorderRef.current = null;
      voiceStreamRef.current = null;
      pendingAttachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    };
  }, []);

  useEffect(() => {
    if (voiceRecordingState === "idle") return;
    const interval = window.setInterval(() => {
      if (voiceStartedAtRef.current > 0) {
        setVoiceElapsedMs(Date.now() - voiceStartedAtRef.current);
      }
    }, 200);
    return () => window.clearInterval(interval);
  }, [voiceRecordingState]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 176)}px`;
    textarea.style.overflowY = "hidden";
  }, [content, isEditing]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !activeChatKey || focusBlocked) return;
    if (
      disabled ||
      isSending ||
      isUploading ||
      isEditing ||
      voiceRecordingState !== "idle" ||
      isComposerAttachmentMenuOpen ||
      isModalAttachmentMenuOpen ||
      pendingAttachments.length > 0
    ) return;

    const activeElement = document.activeElement;
    if (
      activeElement &&
      activeElement !== textarea &&
      activeElement instanceof HTMLElement &&
      activeElement.matches("input, textarea, [contenteditable=\"true\"]")
    ) return;

    if (document.querySelector('[role="dialog"], [aria-modal="true"], [role="menu"]')) return;

    const frame = window.requestAnimationFrame(() => {
      if (
        textareaRef.current &&
        !textareaRef.current.disabled &&
        !document.querySelector('[role="dialog"], [aria-modal="true"], [role="menu"]')
      ) {
        textareaRef.current.focus({ preventScroll: true });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    activeChatKey,
    disabled,
    focusBlocked,
    focusRequest,
    isComposerAttachmentMenuOpen,
    isEditing,
    isModalAttachmentMenuOpen,
    isSending,
    isUploading,
    pendingAttachments.length,
    replyTo?.id,
    voiceRecordingState,
  ]);

  const stopTyping = () => { onTypingStop?.() }; 
 
  const handleChange = (value: string) => {
    setEntities((current) => transformTextLinkEntities(current, content, value));
    setContent(value);
    if (value.trim().length > 0) { 
        onTypingStart?.(); 
    } else { 
        stopTyping(); 
    } 
   }; 

  const openLinkEditor = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start >= end || content.slice(start, end).trim().length === 0) return;
    const existing = entities.find((entity) => entity.offset <= start && entity.offset + entity.length >= end);
    setLinkEditor({ start, end });
    setLinkUrl(existing?.url ?? "");
    setLinkInvalid(false);
  };

  const saveLinkEditor = () => {
    if (!linkEditor) return;
    const value = linkUrl.trim();
    if (value && !isSafeExternalUrl(value)) { setLinkInvalid(true); return; }
    const intersecting = entitiesIntersectingRange(entities, linkEditor.start, linkEditor.end);
    const remaining = entities.filter((entity) => !intersecting.some((item) => item === entity));
    const next = value
      ? [...remaining, { type: "text_link" as const, offset: linkEditor.start, length: linkEditor.end - linkEditor.start, url: value }]
      : remaining;
    setEntities(normalizeTextLinkEntities(next, content));
    const { start, end } = linkEditor;
    setLinkEditor(null);
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(start, end);
  };

  const handleSuccessfulSend = () => {
    if (replyTo) onCancelReply?.();
    setFocusRequest((current) => current + 1);
  };

  const releaseVoiceStream = () => {
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    voiceRecorderRef.current = null;
  };

  const resetVoiceRecording = () => {
    releaseVoiceStream();
    voiceChunksRef.current = [];
    voiceStartedAtRef.current = 0;
    voiceDiscardRef.current = false;
    setVoiceElapsedMs(0);
    setVoiceRecordingState("idle");
  };

  const sendVoiceRecording = async (chunks: BlobPart[], mimeType: string, durationMs: number) => {
    if (voiceSendLockRef.current || chunks.length === 0) return;
    voiceSendLockRef.current = true;
    setVoiceRecordingState("processing");
    const file = createVoiceRecordingFile(chunks, mimeType);
    const voiceAttachment: PendingAttachment = {
      id: `pending-voice-${Date.now()}`,
      file,
      name: file.name,
      mimeType,
      size: file.size,
      kind: "voice",
      previewUrl: null,
      durationMs: Math.max(1, Math.round(durationMs)),
    };

    try {
      const mediaFileId = await performUpload(voiceAttachment, 1, 1);
      await onSend({ content: null, mediaFileId, mediaFileIds: null }, replyTo?.id);
      resetUploadState();
      resetVoiceRecording();
      handleSuccessfulSend();
    } catch (error) {
      console.error("Failed to send voice message:", error);
      setUploadStatus("error");
      setUploadError(error instanceof AttachmentUploadError ? "Voice upload failed" : "Voice message send failed");
      setUploadLabel(null);
      setVoiceRecordingState("idle");
    } finally {
      releaseVoiceStream();
      voiceSendLockRef.current = false;
    }
  };

  const cancelVoiceRecording = () => {
    if (voiceRecordingState === "idle") return;
    voiceDiscardRef.current = true;
    voiceRecorderRef.current?.stop();
    releaseVoiceStream();
    voiceChunksRef.current = [];
    setVoiceElapsedMs(0);
    setVoiceRecordingState("idle");
  };

  const stopVoiceRecording = () => {
    if (voiceRecordingState !== "recording" || voiceSendLockRef.current) return;
    voiceRecorderRef.current?.stop();
    setVoiceRecordingState("processing");
  };

  const startVoiceRecording = async () => {
    if (
      disabled ||
      isEditing ||
      isSending ||
      isUploading ||
      pendingAttachments.length > 0 ||
      voiceRecordingState !== "idle"
    ) return;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setUploadStatus("error");
      setUploadError("Voice recording is not supported in this app");
      return;
    }

    const mimeType = selectVoiceRecordingMimeType();
    if (!mimeType) {
      setUploadStatus("error");
      setUploadError("No supported voice recording format is available");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      voiceDiscardRef.current = false;
      voiceStartedAtRef.current = Date.now();
      setVoiceElapsedMs(0);
      setVoiceRecordingState("recording");

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setUploadStatus("error");
        setUploadError("Voice recording failed");
        releaseVoiceStream();
        setVoiceRecordingState("idle");
      };
      recorder.onstop = () => {
        const chunks = voiceChunksRef.current;
        const durationMs = Math.max(1, Date.now() - voiceStartedAtRef.current);
        const discarded = voiceDiscardRef.current;
        releaseVoiceStream();
        voiceChunksRef.current = [];
        if (discarded) return;
        void sendVoiceRecording(chunks, recorder.mimeType || mimeType, durationMs);
      };
      recorder.start();
    } catch (error) {
      console.error("Unable to access microphone:", error);
      releaseVoiceStream();
      setVoiceRecordingState("idle");
      setUploadStatus("error");
      setUploadError("Microphone permission was denied or no input device is available");
    }
  };

  useEffect(() => {
    return () => {
      if (voiceRecordingState !== "idle") cancelVoiceRecording();
    };
  }, [activeChatKey]);

  const resetUploadState = () => {
    setUploadStatus("idle");
    setUploadProgress(0);
    setUploadError(null);
    setUploadLabel(null);
  };

  const revokeAttachmentPreview = (attachment: PendingAttachment) => {
    if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
  };

  const clearPendingAttachments = (attachments = pendingAttachmentsRef.current) => {
    logAttachmentDebug("queue.clear", {
      itemCount: attachments.length,
      localAttachmentIds: attachments.map((attachment) => attachment.id),
    }, {
      batchId: attachmentBatchIdRef.current,
      table: attachments.map((attachment) => summarizeAttachmentLike(attachment)),
    });
    attachments.forEach(revokeAttachmentPreview);
    uploadedMediaFileIdsRef.current.clear();
    pendingAttachmentsRef.current = [];
    attachmentBatchIdRef.current = null;
    setIsComposerAttachmentMenuOpen(false);
    setIsModalAttachmentMenuOpen(false);
    setPendingAttachments([]);
    resetUploadState();
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((current) => {
      const next: PendingAttachment[] = [];
      for (const attachment of current) {
        if (attachment.id === id) {
          uploadedMediaFileIdsRef.current.delete(attachment.id);
          revokeAttachmentPreview(attachment);
          continue;
        }
        next.push(attachment);
      }
      pendingAttachmentsRef.current = next;
      logAttachmentDebug("queue.remove", {
        removedLocalAttachmentId: id,
        itemCount: next.length,
        localAttachmentIds: next.map((attachment) => attachment.id),
      }, {
        batchId: attachmentBatchIdRef.current,
        table: next.map((attachment) => summarizeAttachmentLike(attachment)),
      });
      if (next.length === 0) {
        attachmentBatchIdRef.current = null;
        setIsModalAttachmentMenuOpen(false);
        resetUploadState();
      }
      return next;
    });
  };

  const appendPendingAttachments = (files: File[]) => {
    if (files.length === 0) return;

    const validAttachments: PendingAttachment[] = [];
    const selectedFileSummaries: Array<Record<string, unknown>> = [];
    let firstValidationError: string | null = null;
    const selectedFilesBatchId =
      attachmentBatchIdRef.current ??
      (pendingAttachmentsRef.current.length === 0 ? createAttachmentBatchId() : null);

    if (selectedFilesBatchId && !attachmentBatchIdRef.current) {
      attachmentBatchIdRef.current = selectedFilesBatchId;
    }

    for (const file of files) {
      const validationError = validateAttachmentFile(file);
      if (validationError) {
        selectedFileSummaries.push({
          name: file.name,
          type: file.type || null,
          size: file.size,
          kind: null,
          localAttachmentId: null,
          validationError,
        });
        firstValidationError ??= validationError;
        continue;
      }

      const classification = classifyPendingAttachment(file);
      if (!classification) {
        selectedFileSummaries.push({
          name: file.name,
          type: file.type || null,
          size: file.size,
          kind: null,
          localAttachmentId: null,
          validationError: "Unsupported file type",
        });
        firstValidationError ??= ALLOWED_ATTACHMENT_LABEL;
        continue;
      }

      const { kind, mimeType } = classification;
      const pendingAttachment: PendingAttachment = {
        id: `pending-attachment-${attachmentIdRef.current++}`,
        file,
        name: file.name,
        mimeType,
        size: file.size,
        kind,
        previewUrl: kind === "file" ? null : URL.createObjectURL(file),
      };

      validAttachments.push(pendingAttachment);
      selectedFileSummaries.push({
        ...summarizeAttachmentLike(pendingAttachment),
        type: file.type || null,
      });
    }

    logAttachmentDebug("files.selected", {
      selectedCount: files.length,
      acceptedCount: validAttachments.length,
      rejectedCount: files.length - validAttachments.length,
      validationError: firstValidationError,
    }, {
      batchId: attachmentBatchIdRef.current,
      table: selectedFileSummaries,
    });

    if (validAttachments.length > 0) {
      setPendingAttachments((current) => {
        const next = [...current, ...validAttachments];
        pendingAttachmentsRef.current = next;
        logAttachmentDebug("queue.append", {
          itemCount: next.length,
          localAttachmentIds: next.map((attachment) => attachment.id),
        }, {
          batchId: attachmentBatchIdRef.current,
          table: next.map((attachment) => summarizeAttachmentLike(attachment)),
        });
        return next;
      });
    }

    if (firstValidationError) {
      setUploadStatus("error");
      setUploadError(firstValidationError);
      setUploadProgress(0);
      setUploadLabel(null);
      return;
    }

    resetUploadState();
  };

  const removeQueuedAttachments = (attachmentIds: string[]) => {
    const attachmentIdSet = new Set(attachmentIds);
    setPendingAttachments((current) => {
      const next: PendingAttachment[] = [];
      for (const attachment of current) {
        if (attachmentIdSet.has(attachment.id)) {
          uploadedMediaFileIdsRef.current.delete(attachment.id);
          revokeAttachmentPreview(attachment);
          continue;
        }
        next.push(attachment);
      }
      pendingAttachmentsRef.current = next;
      logAttachmentDebug("queue.remove.sent", {
        removedLocalAttachmentIds: attachmentIds,
        remainingCount: next.length,
        remainingLocalAttachmentIds: next.map((attachment) => attachment.id),
      }, {
        batchId: attachmentBatchIdRef.current,
        table: next.map((attachment) => summarizeAttachmentLike(attachment)),
      });
      if (next.length === 0) {
        attachmentBatchIdRef.current = null;
      }
      return next;
    });
  };

  const buildAttachmentMessagePayload = (
    uploadedMediaFileIds: string[],
    messageContent: string | null,
    debugMeta?: AttachmentDebugMeta | null,
  ) => {
    const payload: {
      content?: string | null;
      mediaFileId?: string | null;
      mediaFileIds?: string[] | null;
      __attachmentDebug?: AttachmentDebugMeta | null;
    } = {
      content: messageContent,
      mediaFileId: uploadedMediaFileIds[0] ?? null,
      mediaFileIds: uploadedMediaFileIds.length > 1 ? uploadedMediaFileIds : null,
    };

    if (debugMeta && isAttachmentDebugEnabled()) {
      payload.__attachmentDebug = debugMeta;
    }

    return payload;
  };

  const handleSend = async () => { 
    if ((!content.trim() && pendingAttachments.length === 0) || isSending || isUploading || sendLockRef.current) return; 
 
     stopTyping(); 
     setIsComposerAttachmentMenuOpen(false);
     setIsModalAttachmentMenuOpen(false);
     sendLockRef.current = true;
     setIsSending(true); 
     let sendFailureMessage = "Message send failed";
 
     try { 
       const trimmedData = trimTextAndEntities(content, entities);
       const trimmed = trimmedData.text;
       if (pendingAttachments.length === 0 && isEditing && editingMessage && socketManager) { 
         const { id, chatType, targetId } = editingMessage; 
 
         if (chatType === 'direct') { 
           await socketManager.editMessage(
             withFallbackRef(
               targetId,
               undefined,
               conversationPreviews[targetId]
                 ? { id: targetId, public_id: conversationPreviews[targetId].partner_public_id }
                 : undefined,
             ),
             id,
             trimmed,
             trimmedData.entities,
           ); 
         } else { 
          await socketManager.editRoomMessage(targetId, id, trimmed, trimmedData.entities);
         } 
         cancelEditing(); 
         setContent("");
         resetUploadState();
       } else if (pendingAttachments.length === 0) { 
        await onSend({ content: trimmed || null, ...(trimmedData.entities.length > 0 ? { entities: trimmedData.entities } : {}), mediaFileId: null }, replyTo?.id);
        setContent("");
        resetUploadState();
        handleSuccessfulSend();
       } else {
        // Freeze the current queue at send start so UI updates do not drop later units.
        const attachmentsToSend = await Promise.all(
          pendingAttachmentsRef.current.map(async (attachment) => {
            if (attachment.kind !== "audio" || attachment.durationMs != null) return { ...attachment };

            try {
              const durationMs = await extractAudioDurationMs(attachment.file);
              return { ...attachment, durationMs: durationMs ?? undefined };
            } catch {
              return { ...attachment, durationMs: undefined };
            }
          }),
        );
        const batchId = attachmentBatchIdRef.current ?? createAttachmentBatchId();
        attachmentBatchIdRef.current = batchId;
        const sendUnits = buildAttachmentSendUnits(attachmentsToSend).map((unit) => ({
          ...unit,
          attachments: [...unit.attachments],
        }));
        const visualSelectionCount = attachmentsToSend.filter(
          (attachment) => attachment.kind === "photo" || attachment.kind === "video",
        ).length;
        const totalUploads = attachmentsToSend.length;
        const uploadController = new AbortController();
        uploadAbortControllerRef.current = uploadController;

        logAttachmentDebug("send.click", {
          queueCount: attachmentsToSend.length,
          visualSelectionCount,
          documentSelectionCount: attachmentsToSend.length - visualSelectionCount,
          classification: visualSelectionCount > 1 ? "album-capable" : "single-or-mixed",
        }, {
          batchId,
          table: attachmentsToSend.map((attachment) => summarizeAttachmentLike(attachment)),
        });

        const attachmentsToUpload = attachmentsToSend.filter(
          (attachment) => !uploadedMediaFileIdsRef.current.has(attachment.id),
        );
        const cachedUploadCount = totalUploads - attachmentsToUpload.length;

        if (attachmentsToUpload.length > 0) {
          const uploadedIds = await uploadAttachmentsBounded(
            attachmentsToUpload,
            (attachment, index, signal) => performUpload(
              attachment,
              cachedUploadCount + index + 1,
              totalUploads,
              batchId,
              `${batchId}:upload`,
              signal,
            ),
            {
              signal: uploadController.signal,
              onProgress: (completed) => {
                setUploadProgress(Math.round(((cachedUploadCount + completed) / totalUploads) * 100));
              },
            },
          );

          attachmentsToUpload.forEach((attachment, index) => {
            uploadedMediaFileIdsRef.current.set(attachment.id, uploadedIds[index]);
          });
        }

        for (const [unitIndex, unit] of sendUnits.entries()) {
          const uploadedMediaFileIds = unit.attachments.map((attachment) => {
            const mediaFileId = uploadedMediaFileIdsRef.current.get(attachment.id);
            if (!mediaFileId) throw new Error("Missing uploaded attachment");
            return mediaFileId;
          });
          const sendUnitId = createAttachmentSendUnitId(batchId, unitIndex);
          const debugMeta: AttachmentDebugMeta = {
            batchId,
            sendUnitId,
            localAttachmentIds: unit.attachments.map((attachment) => attachment.id),
            unitIndex,
            selectedAttachmentCount: attachmentsToSend.length,
          };

          logAttachmentDebug("send.unit", {
            unitIndex,
            unitType: getAttachmentSendUnitType(unit),
            fileCount: unit.attachments.length,
            localAttachmentIds: debugMeta.localAttachmentIds,
            expectedMediaFileIdsCount: unit.attachments.length,
          }, {
            batchId,
            sendUnitId,
            table: unit.attachments.map((attachment) => summarizeAttachmentLike(attachment)),
          });

          const shouldUseContent =
            trimmed.length > 0 &&
            unitIndex === sendUnits.length - 1;

          sendFailureMessage =
            unit.kind === "visual" && uploadedMediaFileIds.length > 1
              ? "Album send failed"
              : "Message send failed";

          const outgoingPayload = {
            ...buildAttachmentMessagePayload(
              uploadedMediaFileIds,
              shouldUseContent ? trimmed : null,
              debugMeta,
            ),
            ...(shouldUseContent && trimmedData.entities.length > 0 ? { entities: trimmedData.entities } : {}),
          };

          logAttachmentDebug("send.payload", {
            contentPresent: Boolean(outgoingPayload.content),
            mediaFileId: outgoingPayload.mediaFileId ?? null,
            mediaFileIds: outgoingPayload.mediaFileIds ?? null,
            media_file_id: outgoingPayload.mediaFileId ?? null,
            media_file_ids: outgoingPayload.mediaFileIds ?? null,
            attachmentCount: unit.attachments.length,
            finalPayloadKeys: Object.keys(outgoingPayload).sort(),
          }, {
            batchId,
            sendUnitId,
          });

          await onSend(
            outgoingPayload,
            shouldUseContent || (unitIndex === 0 && trimmed.length === 0) ? replyTo?.id : undefined,
          );

          logAttachmentDebug("send.result", {
            status: "resolved",
            fileCount: unit.attachments.length,
            localAttachmentIds: debugMeta.localAttachmentIds,
          }, {
            batchId,
            sendUnitId,
          });

          removeQueuedAttachments(unit.attachments.map((attachment) => attachment.id));

          if (shouldUseContent) setContent("");
        }

        resetUploadState();
        uploadAbortControllerRef.current = null;
        handleSuccessfulSend();
      }
     } catch (err) { 
       if (err instanceof DOMException && err.name === "AbortError") {
         setUploadStatus("idle");
         setUploadError(null);
         setUploadLabel(null);
         return;
       }
       console.error("Failed to send/edit:", err); 
       setUploadStatus("error");
       setUploadError(
         err instanceof AttachmentUploadError
           ? err.status === 429
             ? "Upload rate limit exceeded. Please try again."
             : "Upload failed"
           : sendFailureMessage,
       );
       setUploadLabel(null);
     } finally { 
       sendLockRef.current = false;
       setIsSending(false); 
     } 
  }; 

  const performUpload = (
    attachment: PendingAttachment,
    position = 1,
    total = 1,
    batchId?: string | null,
    sendUnitId?: string | null,
    signal?: AbortSignal,
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!currentUser || !authToken) {
        reject(new AttachmentUploadError("Login required"));
        return;
      }

      logAttachmentDebug("upload.start", {
        position,
        total,
        ...summarizeAttachmentLike(attachment),
      }, {
        batchId,
        sendUnitId,
      });

      setUploadStatus("uploading");
      setUploadProgress(0);
      setUploadError(null);
      setUploadLabel(total > 1 ? `${attachment.file.name} (${position}/${total})` : attachment.file.name);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE_URL}/media`);
      xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
      xhr.responseType = "json";
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", abortRequest);
        callback();
      };

      const abortRequest = () => {
        xhr.abort();
      };

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      };

      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          logAttachmentDebug("upload.failure", {
            statusCode: xhr.status,
            ...summarizeAttachmentLike(attachment),
            response: summarizeUnknownShape(xhr.response),
          }, {
            batchId,
            sendUnitId,
            level: "warn",
          });
          const retryAfter = parseRetryAfterMs(
            typeof xhr.getResponseHeader === "function"
              ? xhr.getResponseHeader("Retry-After")
              : null,
          );
          finish(() => reject(new AttachmentUploadError("Upload failed", xhr.status, retryAfter)));
          return;
        }
        const response = xhr.response ?? {};
        const mediaFileId = response?.data?.media_file_id ?? response?.media_file_id;
        logAttachmentDebug("upload.success", {
          mediaFileId: mediaFileId ?? null,
          ...summarizeAttachmentLike(attachment),
          response: summarizeUnknownShape(response),
        }, {
          batchId,
          sendUnitId,
        });
        if (!mediaFileId) {
          finish(() => reject(new AttachmentUploadError("Upload response missing media id")));
          return;
        }
        finish(() => resolve(mediaFileId));
      };

      xhr.onerror = () => {
        logAttachmentDebug("upload.failure", {
          statusCode: xhr.status || null,
          ...summarizeAttachmentLike(attachment),
          response: summarizeUnknownShape(xhr.response),
        }, {
          batchId,
          sendUnitId,
          level: "warn",
        });
        finish(() => reject(new AttachmentUploadError("Upload failed", xhr.status || null)));
      };

      xhr.onabort = () => {
        finish(() => reject(new DOMException("Upload cancelled", "AbortError")));
      };

      if (signal?.aborted) {
        abortRequest();
        return;
      }
      signal?.addEventListener("abort", abortRequest, { once: true });

      const formData = new FormData();
      formData.append("file", attachment.file);
      if (attachment.kind === "voice" || attachment.kind === "audio") {
        formData.append("kind", attachment.kind);
        if (attachment.durationMs != null) {
          formData.append("duration_ms", String(attachment.durationMs));
        }
      }
      xhr.send(formData);
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.currentTarget.value = "";
    appendPendingAttachments(files);
  };

  const openMediaPicker = () => {
    mediaInputRef.current?.click();
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length === 0) return;
    
    e.preventDefault();
    appendPendingAttachments(files);
  };

  const handleAttachClick = () => {
    if (disabled || isSending || isEditing || isUploading) return;
    setIsModalAttachmentMenuOpen(false);
    setIsComposerAttachmentMenuOpen((current) => !current);
  };

  const handleModalAddClick = () => {
    if (disabled || isSending || isEditing || isUploading) return;
    setIsComposerAttachmentMenuOpen(false);
    setIsModalAttachmentMenuOpen((current) => !current);
  };

  const handleCloseAttachmentReview = () => {
    if (isSending || isUploading) return;
    clearPendingAttachments();
  };
 
   const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => { 
     if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
       const start = e.currentTarget.selectionStart;
       const end = e.currentTarget.selectionEnd;
       if (start < end && e.currentTarget.value.slice(start, end).trim().length > 0) {
         e.preventDefault();
         openLinkEditor();
         return;
       }
     }
     if (linkEditor) {
       if (e.key === "Escape") { e.preventDefault(); setLinkEditor(null); }
       return;
     }
     if (e.key === "Enter" && !e.shiftKey) { 
       e.preventDefault(); 
       if (pendingAttachments.length > 0) return;
       handleSend(); 
     } 
     if (e.key === "Escape") {
       if (isEditing) cancelEditing(); 
       if (pendingAttachments.length > 0 && !isSending && !isUploading) clearPendingAttachments();
     } 
   }; 
 
   return ( 
     <>
     {pendingAttachments.length > 0 && (
       <AttachmentReviewModal
         batchId={attachmentBatchIdRef.current}
         attachments={pendingAttachments}
         content={content}
         isSending={isSending}
         isUploading={isUploading}
         uploadStatus={uploadStatus}
         uploadProgress={uploadProgress}
         uploadLabel={uploadLabel}
         uploadError={uploadError}
         isAddMenuOpen={isModalAttachmentMenuOpen}
         addAttachmentMenu={
           <AttachmentSourceMenu
             placement="modal"
             onClose={() => setIsModalAttachmentMenuOpen(false)}
             onSelectMedia={openMediaPicker}
             onSelectFile={openFilePicker}
           />
         }
         onClose={handleCloseAttachmentReview}
         onToggleAddMenu={handleModalAddClick}
         onRemoveAttachment={removePendingAttachment}
         onContentChange={handleChange}
         onSend={handleSend}
       />
     )}
     <div className="relative flex flex-col border-t border-border bg-[color:var(--vetra-shell-chat-bg,var(--color-card))]" data-testid="message-composer-shell">
       {linkEditor && (
         <LinkEditor
           url={linkUrl}
           invalid={linkInvalid}
           onChange={(value) => { setLinkUrl(value); setLinkInvalid(false); }}
           onSave={saveLinkEditor}
           onCancel={() => setLinkEditor(null)}
         />
       )}
       {isEditing && ( 
         <div className="flex items-center justify-between border-b border-border bg-muted/35 px-4 py-2.5"> 
           <div className="flex flex-col text-xs"> 
             <span className="font-medium">Editing</span> 
             <span className="text-muted-foreground truncate max-w-md"> 
               <EmojiText text={editingMessage!.content} /> 
             </span> 
           </div>
          <button className="vt-button min-h-8 px-3 py-0 text-xs" onClick={cancelEditing}>Cancel</button> 
         </div> 
       )} 
 
       {replyTo && !isEditing && ( 
        <div className="flex items-center justify-between border-b border-border bg-muted/35 px-4 py-2.5">
          <div className="flex flex-col text-xs">
            <span className="font-medium">Reply to {replyTo.author}</span>
            <span className="text-muted-foreground truncate max-w-md">
              <EmojiText text={replyTo.content} />
            </span>
          </div>
          <button className="vt-button min-h-8 px-3 py-0 text-xs" onClick={onCancelReply}>Cancel</button>
        </div>
       )}

       {voiceRecordingState !== "idle" && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-xs" data-testid="voice-recording-panel">
          <span className={voiceRecordingState === "recording" ? "text-destructive" : "text-muted-foreground"}>
            {voiceRecordingState === "recording"
              ? `Recording ${formatVoiceDuration(voiceElapsedMs)}`
              : "Preparing voice message..."}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="vt-button min-h-8 px-3 text-xs"
              onClick={cancelVoiceRecording}
              disabled={voiceRecordingState === "processing"}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </button>
            <button
              type="button"
              className="vt-button vt-button--primary min-h-8 px-3 text-xs"
              onClick={stopVoiceRecording}
              disabled={voiceRecordingState !== "recording"}
              aria-label="Stop and send voice message"
            >
              <Square className="mr-1 h-3.5 w-3.5" /> Stop and send
            </button>
          </div>
        </div>
       )}

       {uploadStatus !== "idle" && pendingAttachments.length === 0 && (
        <div className="border-b border-border px-4 py-2 text-[11px]">
          {uploadStatus === "uploading" ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">
                  {uploadLabel ? `Uploading ${uploadLabel}` : "Uploading attachment"}
                </span>
                <span className="text-muted-foreground">{uploadProgress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          ) : (
            <span className="text-destructive">{uploadError}</span>
          )}
        </div>
       )}
 
       <div
         className="flex min-h-[46px] items-center gap-1 px-2 py-0.5 sm:px-3"
         data-testid="message-composer-bar"
       >
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={handleAttachClick}
              disabled={disabled || isSending || isEditing || isUploading || voiceRecordingState !== "idle"}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors",
                "hover:bg-accent hover:text-foreground focus-visible:outline-none",
                "disabled:pointer-events-none disabled:opacity-60",
                isComposerAttachmentMenuOpen && "bg-accent text-foreground",
              )}
              aria-label="Attach"
              aria-haspopup="menu"
              aria-expanded={isComposerAttachmentMenuOpen}
            >
              <Paperclip className="h-[18px] w-[18px]" />
              <span className="sr-only">Attach</span>
            </button>
            {isComposerAttachmentMenuOpen && (
              <AttachmentSourceMenu
                placement="composer"
                onClose={() => setIsComposerAttachmentMenuOpen(false)}
                onSelectMedia={openMediaPicker}
                onSelectFile={openFilePicker}
              />
            )}
          </div>
          <input
            type="file"
            ref={mediaInputRef}
            data-testid="attachment-input-media"
            className="hidden"
            accept={MESSAGE_MEDIA_ATTACHMENT_ACCEPT}
            multiple
            onChange={handleFileChange}
          />
          <input
            type="file"
            ref={fileInputRef}
            data-testid="attachment-input-file"
            className="hidden"
            accept={MESSAGE_FILE_ATTACHMENT_ACCEPT}
            multiple
            onChange={handleFileChange}
          />

          <textarea
            ref={textareaRef}
            className={cn(
              "min-h-8 max-h-44 flex-1 resize-none border-0 bg-transparent px-1 py-[6px] text-[15px] leading-5 text-foreground shadow-none outline-none ring-0",
              "focus:border-0 focus:bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
              "placeholder:text-muted-foreground/85 disabled:cursor-not-allowed disabled:opacity-60",
            )}
            data-testid="message-input-textarea"
            placeholder={pendingAttachments.length > 0 ? "Review attachments in dialog" : "Message..."}
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled || isSending || isUploading || pendingAttachments.length > 0 || voiceRecordingState !== "idle"}
            rows={1}
            style={{ overflowY: "hidden" }}
            aria-label="Message composer"
          />

          <button
            type="button"
            onClick={() => void startVoiceRecording()}
            disabled={disabled || isSending || isUploading || isEditing || pendingAttachments.length > 0 || voiceRecordingState !== "idle"}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-foreground focus-visible:outline-none",
              "disabled:pointer-events-none disabled:opacity-60",
            )}
            aria-label="Record voice message"
          >
            <Mic className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            onClick={handleSend}
            disabled={pendingAttachments.length > 0 || (!content.trim() && pendingAttachments.length === 0) || disabled || isSending || isUploading || voiceRecordingState !== "idle"}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
              "hover:bg-accent focus-visible:outline-none",
              "disabled:pointer-events-none disabled:opacity-60",
              content.trim()
                ? "text-primary"
                : "text-muted-foreground",
            )}
            aria-label={isSending ? "Sending..." : "Send"}
          >
            <SendHorizonal className="h-[18px] w-[18px]" />
            <span className="sr-only">{isSending ? "Sending..." : "Send"}</span>
          </button>
       </div>
     </div>
     </>
   ); 
 }
