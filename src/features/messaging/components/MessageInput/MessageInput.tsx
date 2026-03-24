import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from "react"; 
import { useAppStore, type RootState } from "@/store"; 
import { API_BASE_URL } from "@/api/base";
 
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
 
   // Подставляем текст + фокус при входе в режим редактирования 
   useEffect(() => { 
     if (isEditing && editingMessage) { 
       setContent(editingMessage.content); 
       setTimeout(() => { 
         textareaRef.current?.focus(); 
         textareaRef.current?.select(); // выделяем весь текст (как в Telegram) 
       }, 10); 
     } else if (!isEditing) { 
       setContent(""); 
     } 
   }, [isEditing, editingMessage]); 
 
   // Сброс редактирования при смене чата 
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
 
   const stopTyping = () => { onTypingStop?.() }; 
 
   const handleChange = (value: string) => { 
    setContent(value); 
    if (value.trim().length > 0) { 
        onTypingStart?.(); 
    } else { 
        stopTyping(); 
    } 
   }; 
 
  const handleSend = async () => { 
    const trimmed = content.trim(); 
    if (!trimmed || isSending || isUploading) return; 
 
     stopTyping(); 
     setIsSending(true); 
 
     try { 
       if (isEditing && editingMessage && socketManager) { 
         const { id, chatType, targetId } = editingMessage; 
 
         if (chatType === 'direct') { 
           await socketManager.editMessage(targetId, id, trimmed); 
         } else { 
           await socketManager.editRoomMessage(targetId, id, trimmed); 
         } 
         cancelEditing(); 
       } else { 
        await onSend({ content: trimmed }, replyTo?.id); 
       } 
 
       setContent(""); // очищаем после отправки/сохранения 
     } catch (err) { 
       console.error("Failed to send/edit:", err); 
     } finally { 
       setIsSending(false); 
     } 
   }; 

  const startUpload = async (file: File) => {
    if (!currentUser || !authToken) {
      setUploadStatus("error");
      setUploadError("You must be logged in to upload files");
      setPendingFile(file);
      return;
    }

    setUploadStatus("uploading");
    setUploadProgress(0);
    setUploadError(null);
    setPendingFile(file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/media`);
    xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      setUploadProgress(percent);
    };

    xhr.onload = async () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        const errMsg = xhr.response?.error || xhr.response?.message || "Upload failed";
        setUploadStatus("error");
        setUploadError(errMsg);
        return;
      }

      const response = xhr.response ?? {};
      const mediaFileId = response?.data?.media_file_id ?? response?.media_file_id;

      if (!mediaFileId) {
        setUploadStatus("error");
        setUploadError("Upload failed");
        return;
      }

      try {
        await onSend({ content: null, mediaFileId }, replyTo?.id);
        setUploadStatus("idle");
        setUploadProgress(0);
        setUploadError(null);
        setPendingFile(null);
      } catch {
        setUploadStatus("error");
        setUploadError("Failed to send media message");
      }
    };

    xhr.onerror = () => {
      setUploadStatus("error");
      setUploadError("Upload failed");
    };

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setUploadStatus("error");
      setUploadError("Only image and video files are allowed");
      setPendingFile(null);
      return;
    }

    if (!isUploading) startUpload(file);
  };

  const handleAttachClick = () => {
    if (disabled || isSending || isEditing || isUploading) return;
    fileInputRef.current?.click();
  };

  const handleRetryUpload = () => {
    if (pendingFile && !isUploading) startUpload(pendingFile);
  };
 
   const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => { 
     if (e.key === "Enter" && !e.shiftKey) { 
       e.preventDefault(); 
       handleSend(); 
     } 
     if (e.key === "Escape" && isEditing) { 
       cancelEditing(); 
     } 
   }; 
 
   // Авто-ресайз (увеличиваем высоту в режиме редактирования) 
   useEffect(() => { 
     const ta = textareaRef.current; 
     if (!ta) return; 
     ta.style.height = "auto"; 
     ta.style.height = `${Math.min(ta.scrollHeight, isEditing ? 160 : 120)}px`; 
   }, [content, isEditing]); 
 
   return ( 
     <div className="message-input-wrapper"> 
       {/* EDIT BAR */} 
       {isEditing && ( 
         <div className="edit-bar"> 
           <div className="edit-bar-content"> 
             <span className="edit-bar-label">✏️ Editing message</span> 
             <span className="edit-bar-text"> 
               {editingMessage!.content.length > 70 
                 ? editingMessage!.content.slice(0, 67) + "..." 
                 : editingMessage!.content} 
             </span> 
           </div> 
           <button 
             className="edit-bar-cancel" 
             onClick={cancelEditing} 
             title="Cancel editing" 
           > 
             × 
           </button> 
         </div> 
       )} 
 
       {/* REPLY BAR (остаётся без изменений) */} 
       {replyTo && !isEditing && ( 
        <div className="reply-bar">
          <div className="reply-bar-content">
            <span className="reply-bar-label">Ответ для {replyTo.author}</span>
            <span className="reply-bar-text">
              {replyTo.content.slice(0, 60)}{replyTo.content.length > 60 ? "…" : ""}
            </span>
          </div>
          <button className="reply-bar-cancel" onClick={onCancelReply} type="button">×</button>
        </div>
       )} 
 
      <div className="message-input-bar"> 
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        <button
          className="attach-btn"
          onClick={handleAttachClick}
          disabled={disabled || isSending || isEditing || isUploading}
          type="button"
        >
          📎
        </button>
         <textarea 
           ref={textareaRef} 
           className="message-textarea" 
           placeholder={isEditing ? "Edit the message…" : "Type a message…"} 
           value={content} 
           onChange={(e) => handleChange(e.target.value)} 
           onKeyDown={handleKeyDown} 
          disabled={disabled || isSending} 
           rows={1} 
         /> 
         <button 
           className="send-btn" 
           onClick={handleSend} 
          disabled={disabled || isSending || isUploading || !content.trim()} 
         > 
           {isSending ? "…" : isEditing ? "✓" : "➤"} 
         </button> 
       </div> 
      {uploadStatus !== "idle" && (
        <div className="upload-status">
          {uploadStatus === "uploading" && (
            <>
              <div className="upload-progress">
                <div
                  className="upload-progress-bar"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="upload-progress-text">{uploadProgress}%</span>
            </>
          )}
          {uploadStatus === "error" && (
            <>
              <span className="upload-error-text">{uploadError ?? "Upload failed"}</span>
              {pendingFile && (
                <button className="upload-retry-btn" onClick={handleRetryUpload} type="button">
                  Retry
                </button>
              )}
            </>
          )}
        </div>
      )}
     </div> 
   ); 
 }
