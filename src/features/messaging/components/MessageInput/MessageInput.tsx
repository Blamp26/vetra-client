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
  const [theme, setTheme] = useState<Theme>(Theme.AUTO);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? Theme.DARK : Theme.LIGHT);
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // Начальная установка
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? Theme.DARK : Theme.LIGHT);

    return () => observer.disconnect();
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

  // Добавляем id и name для инпута поиска в EmojiPicker
  useEffect(() => {
    if (!showEmojiPicker || !emojiPickerRef.current) return;

    const addAttributes = () => {
      const input = emojiPickerRef.current?.querySelector('input[aria-label*="search"], input[type="text"]');
      if (input) {
        if (!input.getAttribute('id')) input.setAttribute('id', 'emoji-search-input');
        if (!input.getAttribute('name')) input.setAttribute('name', 'emoji-search');
      }
    };

    // Сразу пробуем добавить
    addAttributes();

    // Следим за изменениями в DOM (на случай если библиотека перерендерит инпут)
    const observer = new MutationObserver(addAttributes);
    observer.observe(emojiPickerRef.current, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [showEmojiPicker]);

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
      setUploadError("Only images and videos are allowed");
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
     <div className="flex flex-col bg-background/80 backdrop-blur-2xl border-t border-white/5 dark:border-white/[0.02] flex-shrink-0 shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.05)] relative z-20"> 
       {/* EDIT BAR */}
       {isEditing && ( 
         <div className="flex items-center justify-between bg-muted/20 border-b border-white/5 px-6 py-2.5 gap-2 animate-in slide-in-from-bottom-2 duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"> 
           <div className="flex items-center gap-3 min-w-0 flex-1">
             <div className="w-1 h-7 bg-primary rounded-full shrink-0" />
             <div className="flex flex-col gap-0 min-w-0"> 
               <span className="text-[0.78rem] font-semibold text-primary leading-tight">
                 Editing
               </span> 
               <span className="text-[0.82rem] text-muted-foreground truncate leading-tight"> 
                 <EmojiText text={editingMessage!.content} /> 
               </span> 
             </div>
           </div>
           <button 
             className="text-muted-foreground hover:text-destructive transition-colors p-1" 
             onClick={cancelEditing} 
             title="Cancel" 
           > 
             <X className="h-4 w-4" />
           </button> 
         </div> 
       )} 
 
       {/* REPLY BAR */}
       {replyTo && !isEditing && ( 
        <div className="flex items-center justify-between bg-muted/20 border-b border-border/20 px-6 py-2.5 gap-2 animate-in slide-in-from-bottom-2 duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-1 h-7 bg-primary rounded-full shrink-0" />
            <div className="flex flex-col gap-0 min-w-0">
              <span className="text-[0.78rem] font-semibold text-primary truncate leading-tight">
                <EmojiText text={replyTo.author} />
              </span>
              <span className="text-[0.82rem] text-muted-foreground truncate leading-tight">
                <EmojiText text={replyTo.content} />
              </span>
            </div>
          </div>
          <button 
            className="text-muted-foreground hover:text-destructive transition-colors p-1" 
            onClick={onCancelReply} 
            title="Cancel" 
          > 
            <X className="h-4 w-4" />
          </button>
        </div>
       )}

       {/* PREVIEW BAR */}
       {previewUrl && (
         <div className="px-6 pt-3 flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-200">
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
        <div className="px-6 py-2 bg-muted/30 border-b border-border/50 mt-2">
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
              <button onClick={handleRetryUpload} className="text-[11px] font-semibold text-primary hover:underline shrink-0">Retry</button>
            </div>
          )}
        </div>
       )}
 
       <div className="p-3 px-6 pb-4 relative">
         <div className="flex items-end gap-2">
            <button 
              className="inline-flex items-center justify-center rounded-[1rem] text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 size-[2.625rem] shrink-0 text-muted-foreground hover:text-foreground shadow-sm ring-1 ring-inset ring-transparent hover:ring-border/50"
              onClick={handleAttachClick}
              disabled={disabled || isSending || isEditing || isUploading}
              type="button"
            >
              <Paperclip className="h-5 w-5" />
              <input 
                type="file" 
                id="message-file-upload"
                name="file-upload"
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileChange} 
                accept="image/*,video/*" 
              />
            </button>

            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                id="message-content-input"
                name="content"
                className="file:text-foreground placeholder:text-muted-foreground/60 selection:bg-primary/20 selection:text-primary bg-muted/40 hover:bg-muted/60 focus:bg-muted/80 ring-1 ring-inset ring-border/20 focus:ring-primary/50 w-full min-w-0 rounded-[1.25rem] px-5 py-2.5 text-[0.9375rem] leading-[1.4] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] outline-none resize-none pr-[2.75rem] min-h-[42px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                placeholder="Write a message..."
                value={content}
                onChange={(e) => handleChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={disabled || isSending || isUploading}
                rows={1}
              />
              <div className="absolute right-2 top-2" ref={emojiPickerRef}>
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker); }}
                  className="inline-flex items-center justify-center rounded-[0.5rem] text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 size-[1.625rem] text-muted-foreground hover:text-foreground"
                >
                  <Smile className="h-5 w-5" />
                </button>

                {showEmojiPicker && (
                  <div className="absolute bottom-full right-0 mb-2 z-50 overflow-hidden rounded-lg shadow-xl border border-border">
                    <style>{`
                      /* Делаем весь пикер скроллящимся, чтобы хедер уезжал */
                      .EmojiPickerReact { 
                        border: none !important; 
                        box-shadow: none !important; 
                        display: block !important;
                        overflow-y: auto !important;
                        overflow-x: hidden !important;
                        height: 400px !important;
                      }

                      .epr-main {
                        display: block !important;
                      }

                      /* Заголовок (поиск и категории) */
                      .epr-header {
                        position: static !important;
                        padding: 12px !important;
                        background: var(--card) !important;
                      }

                      .epr-search-container {
                        background-color: var(--card) !important;
                      }

                      /* Стили по умолчанию (Светлая тема) */
                      .EmojiPickerReact {
                        background-color: var(--card) !important;
                        --epr-bg-color: var(--card) !important;
                        --epr-category-label-bg-color: var(--card) !important;
                        --epr-text-color: var(--foreground) !important;
                        --epr-search-input-bg-color: var(--muted) !important;
                        --epr-search-input-text-color: var(--foreground) !important;
                        --epr-category-text: #1d4ed8 !important;
                      }

                      /* Переопределение для Темной темы */
                      .dark .EmojiPickerReact {
                        --epr-category-text: #3b82f6 !important;
                      }

                      .epr-body {
                        position: static !important;
                        overflow: visible !important;
                        height: auto !important;
                        padding: 0 12px !important;
                      }

                      /* Скрываем ненужные элементы */
                      .epr-header-overlay, .epr-category-nav, .epr-skin-tone-picker {
                        display: none !important;
                      }

                      /* Категории (заголовки внутри списка) */
                      .epr-emoji-category-label {
                        position: static !important;
                        display: block !important;
                        background: inherit !important;
                        margin: 0 -12px !important;
                        padding: 16px 12px 4px !important;
                        font-size: 11px !important;
                        font-weight: 800 !important;
                        text-transform: uppercase !important;
                        letter-spacing: 0.05em !important;
                        color: var(--epr-category-text) !important;
                        opacity: 1 !important;
                      }

                      /* Поиск (полное перекрытие всех состояний) */
                      .EmojiPickerReact input[aria-label*="search"],
                      .EmojiPickerReact input[type="text"] {
                        background-color: var(--epr-search-input-bg-color) !important;
                        color: var(--epr-search-input-text-color) !important;
                        border: 1px solid rgba(128, 128, 128, 0.2) !important;
                        outline: none !important;
                        box-shadow: none !important;
                      }
                      
                      .EmojiPickerReact input[aria-label*="search"]:focus,
                      .EmojiPickerReact input[type="text"]:focus,
                      .EmojiPickerReact input[aria-label*="search"]:focus-visible,
                      .EmojiPickerReact input[type="text"]:focus-visible {
                        background-color: var(--epr-search-input-bg-color) !important;
                        color: var(--epr-search-input-text-color) !important;
                        outline: none !important;
                        box-shadow: none !important;
                      }
                      
                      .EmojiPickerReact input::placeholder {
                        color: var(--epr-search-input-text-color) !important;
                        opacity: 0.5 !important;
                      }

                      /* Скрываем скроллбар */
                      .EmojiPickerReact::-webkit-scrollbar { display: none !important; }
                      .EmojiPickerReact { 
                        -ms-overflow-style: none !important; 
                        scrollbar-width: none !important; 
                      }

                      /* Темизация (уже настроена выше через переменные) */
                    `}</style>
                    <EmojiPicker 
                      onEmojiClick={onEmojiClick}
                      emojiStyle={EmojiStyle.APPLE}
                      theme={theme}
                      lazyLoadEmojis={true}
                      searchPlaceholder="Поиск..."
                      previewConfig={{ showPreview: false }}
                      skinTonesDisabled={true}
                      searchDisabled={false}
                      skinTonePickerLocation={'NONE' as any}
                      suggestedEmojisMode={'none' as any}
                      width={320}
                      height={400}
                    />
                  </div>
                )}
              </div>
            </div>

            <button 
              className={cn(
                "inline-flex items-center justify-center rounded-[1rem] text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] size-[2.625rem] shrink-0",
                (content.trim() || pendingFile) ? "bg-primary text-primary-foreground hover:scale-[1.03] active:scale-95 shadow-[0_8px_20px_-8px_var(--tw-shadow-color)] shadow-primary/40 ring-1 ring-inset ring-black/10 dark:ring-white/10" : "bg-muted/50 text-muted-foreground/30 ring-1 ring-inset ring-border/50 cursor-not-allowed"
              )}
              onClick={handleSend}
              disabled={(!content.trim() && !pendingFile) || disabled || isSending || isUploading}
            >
              <Send className="h-4 w-4 ml-0.5" />
            </button>
         </div>
       </div>
     </div> 
   ); 
 }
