import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from "react"; 
import { useAppStore, type RootState } from "@/store"; 
import { API_BASE_URL } from "@/api/base";
import { cn } from "@/shared/utils/cn";
import { EmojiText } from "@/shared/components/Emoji/Emoji";
 
interface ReplyTarget { id: number; content: string; author: string; } 
 
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
 
   const textareaRef = useRef<HTMLTextAreaElement>(null); 
  const fileInputRef = useRef<HTMLInputElement>(null);
 
   const editingMessage = useAppStore((s: RootState) => s.editingMessage); 
   const cancelEditing = useAppStore((s: RootState) => s.cancelEditing); 
   const socketManager = useAppStore((s: RootState) => s.socketManager); 
   const activeChat = useAppStore((s: RootState) => s.activeChat); 
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
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

   const stopTyping = () => { onTypingStop?.() }; 
 
   const handleChange = (value: string) => { 
    setContent(value); 
    if (value.trim().length > 0) { 
        onTypingStart?.(); 
    } else { 
        stopTyping(); 
    } 
   }; 

  const cancelPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
    setUploadStatus("idle");
    setUploadError(null);
  };
 
  const handleSend = async () => { 
    if ((!content.trim() && !pendingFile) || isSending || isUploading) return; 
 
     stopTyping(); 
     setIsSending(true); 
 
     try { 
       let mediaFileId = null;
       if (pendingFile) {
         mediaFileId = await performUpload(pendingFile);
         if (!mediaFileId) return;
       }

       const trimmed = content.trim();
       if (isEditing && editingMessage && socketManager) { 
         const { id, chatType, targetId } = editingMessage; 
 
         if (chatType === 'direct') { 
           await socketManager.editMessage(targetId, id, trimmed); 
         } else { 
           await socketManager.editRoomMessage(targetId, id, trimmed); 
         } 
         cancelEditing(); 
       } else { 
        await onSend({ content: trimmed || null, mediaFileId }, replyTo?.id); 
       } 
 
       setContent(""); 
       cancelPreview();
     } catch (err) { 
       console.error("Failed to send/edit:", err); 
     } finally { 
       setIsSending(false); 
     } 
   }; 

  const performUpload = (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!currentUser || !authToken) {
        setUploadStatus("error");
        setUploadError("Login required");
        resolve(null);
        return;
      }

      setUploadStatus("uploading");
      setUploadProgress(0);
      setUploadError(null);

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
        resolve(null);
      };

      const formData = new FormData();
      formData.append("file", file);
      xhr.send(formData);
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPendingFile(file);
    setUploadStatus("idle");
    setUploadError(null);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(i => i.type.startsWith("image/"));
    if (!imageItem) return;
    
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPendingFile(file);
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
       if (previewUrl) cancelPreview();
     } 
   }; 
 
   return ( 
     <div className="flex flex-col border-t border-border bg-background"> 
       {isEditing && ( 
         <div className="flex items-center justify-between border-b border-border p-2"> 
           <div className="flex flex-col text-xs"> 
             <span className="font-normal">Editing</span> 
             <span className="text-muted-foreground truncate max-w-md"> 
               <EmojiText text={editingMessage!.content} /> 
             </span> 
           </div>
           <button onClick={cancelEditing}>Cancel</button> 
         </div> 
       )} 
 
       {replyTo && !isEditing && ( 
        <div className="flex items-center justify-between border-b border-border p-2">
          <div className="flex flex-col text-xs">
            <span className="font-normal">Reply to {replyTo.author}</span>
            <span className="text-muted-foreground truncate max-w-md">
              <EmojiText text={replyTo.content} />
            </span>
          </div>
          <button onClick={onCancelReply}>Cancel</button>
        </div>
       )}

       {previewUrl && (
         <div className="p-2 flex items-center gap-2">
           <div className="relative border border-border p-1">
             {pendingFile?.type.startsWith("image/") ? (
               <img src={previewUrl} className="w-12 h-12 object-cover" alt="preview" />
             ) : (
               <div className="w-12 h-12 bg-muted flex items-center justify-center">File</div>
             )}
             <button 
               onClick={cancelPreview}
               className="absolute -top-2 -right-2 bg-background border border-border px-1 text-[10px]"
             >X</button>
           </div>
           <span className="text-xs truncate">{pendingFile?.name}</span>
         </div>
       )}

       {uploadStatus !== "idle" && (
        <div className="p-1 px-2 text-[10px] border-b border-border">
          {uploadStatus === "uploading" ? (
            <span>Uploading: {uploadProgress}%</span>
          ) : (
            <span className="text-destructive">{uploadError}</span>
          )}
        </div>
       )}
 
       <div className="p-2 flex items-end gap-2">
          <button 
            onClick={handleAttachClick}
            disabled={disabled || isSending || isEditing || isUploading}
          >File</button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileChange} 
          />

          <textarea
            ref={textareaRef}
            className="flex-1 p-2 text-sm border border-border bg-background resize-none min-h-[36px]"
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
            disabled={(!content.trim() && !pendingFile) || disabled || isSending || isUploading}
            className={cn("px-4 py-2 text-sm", (content.trim() || pendingFile) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
          >Send</button>
       </div>
     </div> 
   ); 
 }
