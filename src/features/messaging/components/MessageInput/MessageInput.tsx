import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from "react"; 
import { useAppStore, type RootState } from "@/store"; 
import { API_BASE_URL } from "@/api/base";
import { Paperclip, Smile, Send, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import EmojiPicker, { EmojiStyle, Theme, type EmojiClickData } from 'emoji-picker-react';
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Состояние темы для эмодзи-пикера
  const [theme, setTheme] = useState<Theme>(Theme.LIGHT);

  useEffect(() => {
    // Простая проверка темы (можно доработать если есть стор с темой)
    const isDark = document.documentElement.classList.contains('dark') || 
                   window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(isDark ? Theme.DARK : Theme.LIGHT);
  }, []);
 
   const textareaRef = useRef<HTMLTextAreaElement>(null); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
 
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

  // Закрытие emoji picker при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      window.addEventListener("mousedown", handleClickOutside);
    }
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  // Очистка URL превью
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setContent(prev => prev + emojiData.emoji);
    // Не закрываем пикер сразу, чтобы можно было выбрать несколько
  };
 
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
         if (!mediaFileId) return; // error handled in performUpload
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
 
       setContent(""); // очищаем после отправки/сохранения 
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
        setUploadError("Нужно войти, чтобы загружать файлы");
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
          const errMsg = xhr.response?.error || xhr.response?.message || "Ошибка загрузки";
          setUploadStatus("error");
          setUploadError(errMsg);
          resolve(null);
          return;
        }

        const response = xhr.response ?? {};
        const mediaFileId = response?.data?.media_file_id ?? response?.media_file_id;

        if (!mediaFileId) {
          setUploadStatus("error");
          setUploadError("Ошибка загрузки");
          resolve(null);
          return;
        }

        resolve(mediaFileId);
      };

      xhr.onerror = () => {
        setUploadStatus("error");
        setUploadError("Ошибка загрузки");
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

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setUploadStatus("error");
      setUploadError("Разрешены только изображения и видео");
      setPendingFile(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPendingFile(file);
    setUploadStatus("idle");
    setUploadError(null);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(i => i.type.startsWith("image/"));
    if (!imageItem) return; // обычная текстовая вставка — не трогаем
    
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPendingFile(file);
    setUploadStatus("idle");
    setUploadError(null);
  };

  const handleAttachClick = () => {
    if (disabled || isSending || isEditing || isUploading) return;
    fileInputRef.current?.click();
  };

  const handleRetryUpload = () => {
    if (pendingFile && !isUploading) handleSend();
  };
 
   const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => { 
     if (e.key === "Enter" && !e.shiftKey) { 
       e.preventDefault(); 
       handleSend(); 
     } 
     if (e.key === "Escape") { 
       if (isEditing) cancelEditing(); 
       if (showEmojiPicker) setShowEmojiPicker(false);
       if (previewUrl) cancelPreview();
     } 
   }; 
 
   // Авто-ресайз 
   useEffect(() => { 
     const ta = textareaRef.current; 
     if (!ta) return; 
     ta.style.height = "auto"; 
     ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`; 
   }, [content, isEditing]); 
 
   return ( 
     <div className="flex flex-col border-t border-border bg-background flex-shrink-0"> 
       {/* EDIT BAR */}
       {isEditing && ( 
         <div className="flex items-center justify-between bg-muted/50 border-b border-border px-4 py-2 gap-2"> 
           <div className="flex flex-col gap-0.5 min-w-0"> 
             <span className="text-[0.78rem] font-semibold text-primary flex items-center gap-1.5">
               <span className="text-sm">✏️</span> Редактирование
             </span> 
             <span className="text-[0.82rem] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis"> 
               <EmojiText text={editingMessage!.content} /> 
             </span> 
           </div> 
           <button 
             className="text-muted-foreground hover:text-destructive transition-colors p-1" 
             onClick={cancelEditing} 
             title="Отмена" 
           > 
             <X className="h-4 w-4" />
           </button> 
         </div> 
       )} 
 
       {/* REPLY BAR */}
       {replyTo && !isEditing && ( 
        <div className="flex items-center justify-between bg-muted/50 border-b border-border px-4 py-2 gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[0.78rem] font-semibold text-primary flex items-center gap-1.5">
               <span className="text-sm">↩️</span> Ответ {replyTo.author}
            </span>
            <span className="text-[0.82rem] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
              <EmojiText text={replyTo.content} />
            </span>
          </div>
          <button className="text-muted-foreground hover:text-destructive transition-colors p-1" onClick={onCancelReply} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>
       )}

       {/* PREVIEW BAR */}
       {previewUrl && (
         <div className="px-4 pt-3 flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-200">
           <div className="relative group">
             {pendingFile?.type.startsWith("image/") ? (
               <img src={previewUrl} className="w-16 h-16 rounded-lg object-cover border border-border" alt="preview" />
             ) : (
               <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center border border-border">
                 <Paperclip className="h-6 w-6 text-muted-foreground" />
               </div>
             )}
             <button 
               onClick={cancelPreview}
               className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-foreground text-background flex items-center justify-center shadow-md hover:scale-110 transition-transform"
             >
               <X className="h-3 w-3" />
             </button>
           </div>
           <div className="flex flex-col min-w-0">
             <span className="text-xs font-medium text-foreground truncate">{pendingFile?.name}</span>
             <span className="text-[10px] text-muted-foreground">{(pendingFile!.size / 1024).toFixed(1)} KB</span>
           </div>
         </div>
       )}

       {/* UPLOAD PROGRESS / ERROR */}
       {uploadStatus !== "idle" && (
        <div className="px-4 py-1.5 bg-muted/30 border-b border-border mt-2">
          {uploadStatus === "uploading" ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground w-8 text-right">{uploadProgress}%</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-destructive font-medium truncate">{uploadError}</span>
              <button onClick={handleRetryUpload} className="text-[11px] font-semibold text-primary hover:underline shrink-0">Повторить</button>
            </div>
          )}
        </div>
       )}
 
       <div className="p-4">
         <div className="flex items-center gap-2">
            <button 
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-all hover:bg-accent size-9 h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={handleAttachClick}
              disabled={disabled || isSending || isEditing || isUploading}
            >
              <Paperclip className="h-4 w-4" />
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="image/*,video/*" />
            </button>

            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground bg-muted border-0 h-9 w-full min-w-0 rounded-md px-3 py-1.5 text-sm transition-[color,box-shadow] outline-none focus-visible:ring-1 focus-visible:ring-ring/50 resize-none pr-10 min-h-[36px]"
                placeholder="Напишите сообщение..."
                value={content}
                onChange={(e) => handleChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={disabled || isSending || isUploading}
                rows={1}
              />
              <div className="absolute right-1 top-1" ref={emojiPickerRef}>
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker); }}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-all hover:bg-accent size-7 text-muted-foreground hover:text-foreground"
                >
                  <Smile className="h-4 w-4" />
                </button>

                {showEmojiPicker && (
                  <div className="absolute bottom-full right-0 mb-2 z-50">
                    <EmojiPicker 
                      onEmojiClick={onEmojiClick}
                      emojiStyle={EmojiStyle.APPLE}
                      theme={theme}
                      lazyLoadEmojis={true}
                      searchPlaceholder="Поиск..."
                    />
                  </div>
                )}
              </div>
            </div>

            <button 
              className={cn(
                "inline-flex items-center justify-center rounded-md text-sm font-medium transition-all size-9 h-9 w-9 shrink-0",
                (content.trim() || pendingFile) ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              onClick={handleSend}
              disabled={(!content.trim() && !pendingFile) || disabled || isSending || isUploading}
            >
              <Send className="h-4 w-4" />
            </button>
         </div>
       </div>
     </div> 
   ); 
 }
