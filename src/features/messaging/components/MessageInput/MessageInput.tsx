import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from "react"; 
import { useAppStore, type RootState } from "@/store"; 
import { API_BASE_URL } from "@/api/base";
import { cn } from "@/shared/utils/cn";
import { EmojiText } from "@/shared/components/Emoji/Emoji";
import { withFallbackRef } from "@/shared/utils/refs";
import {
  MESSAGE_ATTACHMENT_ACCEPT,
  formatAttachmentSize,
  getAttachmentKindLabel,
  inferAttachmentKind,
  validateAttachmentFile,
} from "../../utils/attachments";
 
interface ReplyTarget { id: number; content: string; author: string; } 
interface PendingAttachment {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  size: number;
  kind: ReturnType<typeof inferAttachmentKind>;
  previewUrl: string | null;
}
 
interface Props { 
  onSend: (payload: { content?: string | null; mediaFileId?: string | null }, replyToId?: number) => Promise<void>; 
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
 
   const textareaRef = useRef<HTMLTextAreaElement>(null); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentIdRef = useRef(0);
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);
  const sendLockRef = useRef(false);
 
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
    attachments.forEach(revokeAttachmentPreview);
    pendingAttachmentsRef.current = [];
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
      return next;
    });
  };

  const appendPendingAttachments = (files: File[]) => {
    if (files.length === 0) return;

    const validAttachments: PendingAttachment[] = [];
    let firstValidationError: string | null = null;

    for (const file of files) {
      const validationError = validateAttachmentFile(file);
      if (validationError) {
        firstValidationError ??= validationError;
        continue;
      }

      const kind = inferAttachmentKind(file.type);
      validAttachments.push({
        id: `pending-attachment-${attachmentIdRef.current++}`,
        file,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        kind,
        previewUrl: kind === "photo" ? URL.createObjectURL(file) : null,
      });
    }

    if (validAttachments.length > 0) {
      setPendingAttachments((current) => {
        const next = [...current, ...validAttachments];
        pendingAttachmentsRef.current = next;
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
 
  const handleSend = async () => { 
    if ((!content.trim() && pendingAttachments.length === 0) || isSending || isUploading || sendLockRef.current) return; 
 
     stopTyping(); 
     sendLockRef.current = true;
     setIsSending(true); 
 
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
        const attachmentsToSend = [...pendingAttachmentsRef.current];
        const totalAttachments = attachmentsToSend.length;

        for (let index = 0; index < attachmentsToSend.length; index += 1) {
          const attachment = attachmentsToSend[index];
          const mediaFileId = await performUpload(attachment.file, index + 1, totalAttachments);
          if (!mediaFileId) return;

          await onSend(
            {
              content: index === 0 ? trimmed || null : null,
              mediaFileId,
            },
            index === 0 ? replyTo?.id : undefined,
          );

          removePendingAttachment(attachment.id);
          if (index === 0) {
            setContent("");
          }
        }

        resetUploadState();
       } 
     } catch (err) { 
       console.error("Failed to send/edit:", err); 
       setUploadStatus("error");
       setUploadError("Send failed");
       setUploadLabel(null);
     } finally { 
       sendLockRef.current = false;
       setIsSending(false); 
     } 
   }; 

  const performUpload = (file: File, position = 1, total = 1): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!currentUser || !authToken) {
        setUploadStatus("error");
        setUploadError("Login required");
        setUploadLabel(null);
        resolve(null);
        return;
      }

      setUploadStatus("uploading");
      setUploadProgress(0);
      setUploadError(null);
      setUploadLabel(total > 1 ? `${file.name} (${position}/${total})` : file.name);

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
          setUploadLabel(file.name);
          resolve(null);
          return;
        }
        const response = xhr.response ?? {};
        const mediaFileId = response?.data?.media_file_id ?? response?.media_file_id;
        resolve(mediaFileId || null);
      };

      xhr.onerror = () => {
        setUploadStatus("error");
        setUploadError("Upload failed");
        setUploadLabel(file.name);
        resolve(null);
      };

      const formData = new FormData();
      formData.append("file", file);
      xhr.send(formData);
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.currentTarget.value = "";
    appendPendingAttachments(files);
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
    fileInputRef.current?.click();
  };
 
   const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => { 
     if (e.key === "Enter" && !e.shiftKey) { 
       e.preventDefault(); 
       handleSend(); 
     } 
     if (e.key === "Escape") { 
       if (isEditing) cancelEditing(); 
       if (pendingAttachments.length > 0) clearPendingAttachments();
     } 
   }; 
 
   return ( 
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

       {pendingAttachments.length > 0 && (
         <div className="border-b border-border px-4 py-3">
           <div className="space-y-2" data-testid="attachment-queue">
             {pendingAttachments.map((attachment) => (
               <div
                 key={attachment.id}
                 className="flex items-center gap-3"
                 data-testid="attachment-queue-item"
               >
                 <div className="relative shrink-0 rounded-[14px] border border-border bg-card p-1.5">
                   {attachment.previewUrl ? (
                     <img src={attachment.previewUrl} className="h-14 w-14 rounded-[10px] object-cover" alt="preview" />
                   ) : (
                     <div className="flex h-14 w-14 items-center justify-center rounded-[10px] bg-muted text-[10px] font-medium">
                       {getAttachmentKindLabel(attachment.kind)}
                     </div>
                   )}
                   <button
                     type="button"
                     onClick={() => removePendingAttachment(attachment.id)}
                     disabled={disabled || isSending || isUploading}
                     className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-[10px]"
                     aria-label={`Remove ${attachment.name}`}
                   >X</button>
                 </div>
                 <div className="min-w-0 flex-1">
                   <div className="truncate text-sm font-medium">{attachment.name}</div>
                   <div className="pt-0.5 text-[11px] text-muted-foreground">
                     {getAttachmentKindLabel(attachment.kind)} · {formatAttachmentSize(attachment.size)}
                   </div>
                 </div>
               </div>
             ))}
           </div>
         </div>
       )}

       {uploadStatus !== "idle" && (
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
          <button 
            onClick={handleAttachClick}
            disabled={disabled || isSending || isEditing || isUploading}
            className="vt-button min-h-11 shrink-0 px-3.5"
          >Attach</button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept={MESSAGE_ATTACHMENT_ACCEPT}
            multiple
            onChange={handleFileChange} 
          />

          <textarea
            ref={textareaRef}
            className="vt-textarea min-h-11 max-h-44 flex-1 resize-none bg-card px-4 py-3 text-sm leading-6 disabled:opacity-60"
            placeholder="Message..."
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled || isSending || isUploading}
            rows={1}
          />

          <button 
            onClick={handleSend}
            disabled={(!content.trim() && pendingAttachments.length === 0) || disabled || isSending || isUploading}
            className={cn(
              "vt-button min-h-11 shrink-0 px-4 disabled:pointer-events-none disabled:opacity-60",
              (content.trim() || pendingAttachments.length > 0)
                ? "vt-button--primary"
                : "border-border bg-muted text-muted-foreground",
            )}
          >{isSending ? "Sending..." : "Send"}</button>
       </div>
     </div> 
   ); 
 }
