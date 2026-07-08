import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from "react";
import { FileText, ImagePlus, Paperclip } from "lucide-react";
import { useAppStore, type RootState } from "@/store"; 
import { API_BASE_URL } from "@/api/base";
import { cn } from "@/shared/utils/cn";
import { EmojiText } from "@/shared/components/Emoji/Emoji";
import { withFallbackRef } from "@/shared/utils/refs";
import {
  ALLOWED_ATTACHMENT_LABEL,
  classifyPendingAttachment,
  MESSAGE_FILE_ATTACHMENT_ACCEPT,
  MESSAGE_MEDIA_ATTACHMENT_ACCEPT,
  validateAttachmentFile,
} from "../../utils/attachments";
import { AttachmentReviewModal } from "./AttachmentReviewModal";
import {
  buildAttachmentSendUnits,
  getAttachmentSendUnitType,
  type PendingAttachment,
} from "./attachmentQueue";
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

interface ReplyTarget { id: number; content: string; author: string; }

interface Props {
  onSend: (
    payload: {
      content?: string | null;
      mediaFileId?: string | null;
      mediaFileIds?: string[] | null;
      __attachmentDebug?: AttachmentDebugMeta | null;
    },
    replyToId?: number,
  ) => Promise<void>; 
   onTypingStart?: () => void; 
   onTypingStop?: () => void; 
   disabled?: boolean; 
   replyTo?: ReplyTarget | null; 
   onCancelReply?: () => void; 
 } 
 
 export function MessageInput({ 
   onSend, 
   onTypingStart, 
   onTypingStop, 
   disabled = false, 
   replyTo, 
   onCancelReply, 
 }: Props) { 
   const [content, setContent] = useState(""); 
   const [isSending, setIsSending] = useState(false); 
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isComposerAttachmentMenuOpen, setIsComposerAttachmentMenuOpen] = useState(false);
  const [isModalAttachmentMenuOpen, setIsModalAttachmentMenuOpen] = useState(false);

   const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentIdRef = useRef(0);
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);
  const sendLockRef = useRef(false);
  const attachmentBatchIdRef = useRef<string | null>(null);
 
   const editingMessage = useAppStore((s: RootState) => s.editingMessage); 
   const cancelEditing = useAppStore((s: RootState) => s.cancelEditing); 
  const socketManager = useAppStore((s: RootState) => s.socketManager); 
  const activeChat = useAppStore((s: RootState) => s.activeChat); 
  const conversationPreviews = useAppStore((s: RootState) => s.conversationPreviews);
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const authToken = useAppStore((s: RootState) => s.authToken);
 
   const isEditing = !!editingMessage; 
  const isUploading = uploadStatus === "uploading";
 
   useEffect(() => { 
     if (isEditing && editingMessage) { 
       setContent(editingMessage.content); 
       setTimeout(() => { 
         textareaRef.current?.focus(); 
       }, 10); 
     } else if (!isEditing) { 
       setContent(""); 
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
    if (pendingAttachments.length === 0) {
      setIsModalAttachmentMenuOpen(false);
    }
  }, [pendingAttachments.length]);

  useEffect(() => {
    if (!disabled && !isSending && !isUploading && !isEditing) return;
    setIsComposerAttachmentMenuOpen(false);
    setIsModalAttachmentMenuOpen(false);
  }, [disabled, isEditing, isSending, isUploading]);

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
      pendingAttachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    };
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 176)}px`;
    textarea.style.overflowY = "hidden";
  }, [content, isEditing]);

  const stopTyping = () => { onTypingStop?.() }; 
 
   const handleChange = (value: string) => { 
    setContent(value); 
    if (value.trim().length > 0) { 
        onTypingStart?.(); 
    } else { 
        stopTyping(); 
    } 
   }; 

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
       const trimmed = content.trim();
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
           ); 
         } else { 
           await socketManager.editRoomMessage(targetId, id, trimmed); 
         } 
         cancelEditing(); 
         setContent("");
         resetUploadState();
       } else if (pendingAttachments.length === 0) { 
        await onSend({ content: trimmed || null, mediaFileId: null }, replyTo?.id); 
        setContent(""); 
        resetUploadState();
       } else {
        // Freeze the current queue at send start so UI updates do not drop later units.
        const attachmentsToSend = pendingAttachmentsRef.current.map((attachment) => ({ ...attachment }));
        const batchId = attachmentBatchIdRef.current ?? createAttachmentBatchId();
        attachmentBatchIdRef.current = batchId;
        const sendUnits = buildAttachmentSendUnits(attachmentsToSend).map((unit) => ({
          ...unit,
          attachments: [...unit.attachments],
        }));
        const visualSelectionCount = attachmentsToSend.filter(
          (attachment) => attachment.kind === "photo" || attachment.kind === "video",
        ).length;
        const reserveContentForVisualUnit = visualSelectionCount > 1;
        let contentConsumed = false;
        let uploadPosition = 0;
        const totalUploads = attachmentsToSend.length;

        logAttachmentDebug("send.click", {
          queueCount: attachmentsToSend.length,
          visualSelectionCount,
          documentSelectionCount: attachmentsToSend.length - visualSelectionCount,
          classification: reserveContentForVisualUnit ? "album-capable" : "single-or-mixed",
        }, {
          batchId,
          table: attachmentsToSend.map((attachment) => summarizeAttachmentLike(attachment)),
        });

        for (const [unitIndex, unit] of sendUnits.entries()) {
          const uploadedMediaFileIds: string[] = [];
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

          for (const attachment of unit.attachments) {
            uploadPosition += 1;
            const mediaFileId = await performUpload(
              attachment,
              uploadPosition,
              totalUploads,
              batchId,
              sendUnitId,
            );
            if (!mediaFileId) return;
            uploadedMediaFileIds.push(mediaFileId);
          }

          if (unit.kind === "visual" && unit.attachments.length > 1 && uploadedMediaFileIds.length === 1) {
            logAttachmentDebug("warning.album-collapsed-before-send", {
              selectedVisualMediaCount: unit.attachments.length,
              uploadedMediaFileIds,
              localAttachmentIds: debugMeta.localAttachmentIds,
            }, {
              batchId,
              sendUnitId,
              level: "warn",
            });
          }

          const shouldUseContent =
            !contentConsumed &&
            trimmed.length > 0 &&
            (
              reserveContentForVisualUnit
                ? unit.kind === "visual"
                : true
            );

          sendFailureMessage =
            unit.kind === "visual" && uploadedMediaFileIds.length > 1
              ? "Album send failed"
              : "Message send failed";

          const outgoingPayload = buildAttachmentMessagePayload(
            uploadedMediaFileIds,
            shouldUseContent ? trimmed : null,
            debugMeta,
          );

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
            !contentConsumed && shouldUseContent ? replyTo?.id : undefined,
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

          if (shouldUseContent) {
            contentConsumed = true;
            setContent("");
          }
        }

        if (!contentConsumed && trimmed.length > 0) {
          setContent("");
        }

        resetUploadState();
       } 
     } catch (err) { 
       console.error("Failed to send/edit:", err); 
       setUploadStatus("error");
       setUploadError(sendFailureMessage);
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
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!currentUser || !authToken) {
        setUploadStatus("error");
        setUploadError("Login required");
        setUploadLabel(null);
        resolve(null);
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

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      };

      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          setUploadStatus("error");
          setUploadError("Upload failed");
          setUploadLabel(attachment.file.name);
          logAttachmentDebug("upload.failure", {
            statusCode: xhr.status,
            ...summarizeAttachmentLike(attachment),
            response: summarizeUnknownShape(xhr.response),
          }, {
            batchId,
            sendUnitId,
            level: "warn",
          });
          resolve(null);
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
        resolve(mediaFileId || null);
      };

      xhr.onerror = () => {
        setUploadStatus("error");
        setUploadError("Upload failed");
        setUploadLabel(attachment.file.name);
        logAttachmentDebug("upload.failure", {
          statusCode: xhr.status || null,
          ...summarizeAttachmentLike(attachment),
          response: summarizeUnknownShape(xhr.response),
        }, {
          batchId,
          sendUnitId,
          level: "warn",
        });
        resolve(null);
      };

      const formData = new FormData();
      formData.append("file", attachment.file);
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
     <div className="flex flex-col border-t border-border bg-card"> 
       {isEditing && ( 
         <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3"> 
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
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
          <div className="flex flex-col text-xs">
            <span className="font-medium">Reply to {replyTo.author}</span>
            <span className="text-muted-foreground truncate max-w-md">
              <EmojiText text={replyTo.content} />
            </span>
          </div>
          <button className="vt-button min-h-8 px-3 py-0 text-xs" onClick={onCancelReply}>Cancel</button>
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
 
       <div className="flex items-end gap-3 px-4 py-4">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={handleAttachClick}
              disabled={disabled || isSending || isEditing || isUploading}
              className={cn(
                "vt-button min-h-11 shrink-0 gap-2 rounded-[18px] px-3.5",
                isComposerAttachmentMenuOpen && "border-[#4f6158] bg-accent",
              )}
              aria-haspopup="menu"
              aria-expanded={isComposerAttachmentMenuOpen}
            >
              <Paperclip className="h-4 w-4" />
              <span>Attach</span>
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
            className="vt-textarea min-h-11 max-h-44 flex-1 resize-none bg-card px-4 py-3 text-sm leading-6 disabled:opacity-60"
            data-testid="message-input-textarea"
            placeholder={pendingAttachments.length > 0 ? "Review attachments in dialog" : "Message..."}
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled || isSending || isUploading || pendingAttachments.length > 0}
            rows={1}
            style={{ overflowY: "hidden" }}
          />

          <button 
            onClick={handleSend}
            disabled={pendingAttachments.length > 0 || (!content.trim() && pendingAttachments.length === 0) || disabled || isSending || isUploading}
            className={cn(
              "vt-button min-h-11 shrink-0 px-4 disabled:pointer-events-none disabled:opacity-60",
              content.trim()
                ? "vt-button--primary"
                : "border-border bg-muted text-muted-foreground",
            )}
          >{isSending ? "Sending..." : "Send"}</button>
       </div>
     </div>
     </>
   ); 
 }
