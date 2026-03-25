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
     <div className="flex flex-col flex-shrink-0"> 
       {/* EDIT BAR */} 
       {isEditing && ( 
         <div className="flex items-center justify-between bg-white border-t border-[#E1E1E1] px-3 py-1.5 border-l-[3px] border-[#5865F2] gap-2"> 
           <div className="flex flex-col gap-0.5 min-w-0"> 
             <span className="text-[0.78rem] font-semibold text-[#5865F2]">✏️ Editing message</span> 
             <span className="text-[0.82rem] text-[#7A7A7A] whitespace-nowrap overflow-hidden text-ellipsis"> 
               {editingMessage!.content.length > 70 
                 ? editingMessage!.content.slice(0, 67) + "..." 
                 : editingMessage!.content} 
             </span> 
           </div> 
           <button 
             className="bg-none border-none text-[#7A7A7A] cursor-pointer text-[1.2rem] flex-shrink-0 hover:text-[#E74C3C]" 
             onClick={cancelEditing} 
             title="Cancel editing" 
           > 
             × 
           </button> 
         </div> 
       )} 
 
       {/* REPLY BAR */} 
       {replyTo && !isEditing && ( 
        <div className="flex items-center justify-between bg-white border-t border-[#E1E1E1] px-3 py-1.5 border-l-[3px] border-[#5865F2] gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[0.78rem] font-semibold text-[#5865F2]">Replying to {replyTo.author}</span>
            <span className="text-[0.82rem] text-[#7A7A7A] whitespace-nowrap overflow-hidden text-ellipsis">
              {replyTo.content.slice(0, 60)}{replyTo.content.length > 60 ? "…" : ""}
            </span>
          </div>
          <button className="bg-none border-none text-[#7A7A7A] cursor-pointer text-[1.2rem] flex-shrink-0 hover:text-[#E74C3C]" onClick={onCancelReply} type="button">×</button>
        </div>
       )} 
 
      <div className="flex items-end gap-2 px-3.5 py-2.5 bg-[#F8F8F8] border-t border-[#E1E1E1] flex-shrink-0"> 
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        <button
          className="bg-none border-none text-[#7A7A7A] cursor-pointer text-[1.3rem] p-1 rounded-md transition-colors duration-150 hover:bg-white/10 hover:text-[#0A0A0A] disabled:opacity-45 disabled:cursor-not-allowed"
          onClick={handleAttachClick}
          disabled={disabled || isSending || isEditing || isUploading}
          type="button"
        >
          📎
        </button>
         <textarea 
           ref={textareaRef} 
           className="flex-1 bg-white border border-transparent rounded-[22px] text-[#0A0A0A] text-[0.92rem] font-inherit outline-none px-4 py-2.25 resize-none max-h-[120px] overflow-y-auto leading-[1.45] transition-colors duration-150 focus:border-[#5865F2]" 
           placeholder={isEditing ? "Edit the message…" : "Type a message…"} 
           value={content} 
           onChange={(e) => handleChange(e.target.value)} 
           onKeyDown={handleKeyDown} 
          disabled={disabled || isSending} 
           rows={1} 
         /> 
         <button 
           className="bg-none border-none text-[#5865F2] cursor-pointer text-[1.3rem] p-1 rounded-md transition-colors duration-150 hover:bg-white/10 disabled:opacity-45 disabled:cursor-not-allowed" 
           onClick={handleSend} 
          disabled={disabled || isSending || isUploading || !content.trim()} 
         > 
           {isSending ? "…" : isEditing ? "✓" : "➤"} 
         </button> 
       </div> 
      {uploadStatus !== "idle" && (
        <div className="px-3.5 py-1.5 bg-[#F8F8F8] border-t border-[#E1E1E1] flex items-center gap-2">
          {uploadStatus === "uploading" && (
            <>
              <div className="flex-1 h-1 bg-[#E1E1E1] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#5865F2] transition-[width] duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="text-[0.72rem] text-[#7A7A7A] min-w-[30px]">{uploadProgress}%</span>
            </>
          )}
          {uploadStatus === "error" && (
            <>
              <span className="text-[0.72rem] text-[#E74C3C] flex-1">{uploadError ?? "Upload failed"}</span>
              {pendingFile && (
                <button className="text-[0.72rem] text-[#5865F2] font-semibold hover:underline" onClick={handleRetryUpload} type="button">
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
