import React, { useState, useEffect, useRef } from 'react';
import { X, Download, RotateCw, MoreHorizontal } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { useAppStore } from '@/store';
import { AuthenticatedImage } from './AuthenticatedImage';

interface ImageLightboxProps {
  src: string;
  author: string;
  time: string;
  onClose: () => void;
}

/**
 * Full-screen image viewer (Lightbox)
 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, author, time, onClose }) => {
  const [rotation, setRotation] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const authToken = useAppStore((s) => s.authToken);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    // Block background scroll
    document.body.style.overflow = 'hidden';
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, []);

  // Zoom via Ctrl + Wheel (relative to cursor)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        const rect = container.getBoundingClientRect();
        
        // Mouse coordinates relative to container center
        const mouseX = e.clientX - (rect.left + rect.width / 2);
        const mouseY = e.clientY - (rect.top + rect.height / 2);

        setScale(prevScale => {
          const nextScale = Math.max(1, Math.min(prevScale + delta, 5));
          
          if (nextScale === 1) {
            setPosition({ x: 0, y: 0 });
            return 1;
          }

          // Calculate new offset to keep the point under the cursor in place
          const ratio = nextScale / prevScale;
          
          setPosition(prevPos => {
            const nextX = mouseX - (mouseX - prevPos.x) * ratio;
            const nextY = mouseY - (mouseY - prevPos.y) * ratio;

            // Strict limits: photo cannot go beyond container edges
            const limitX = Math.max(0, (rect.width * nextScale - rect.width) / 2);
            const limitY = Math.max(0, (rect.height * nextScale - rect.height) / 2);

            return {
              x: Math.max(-limitX, Math.min(nextX, limitX)),
              y: Math.max(-limitY, Math.min(nextY, limitY))
            };
          });

          return nextScale;
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 400); // Give time for exit animation (smoother)
  };

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation(prev => (prev + 90) % 360);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      
      const limitX = Math.max(0, (rect.width * scale - rect.width) / 2);
      const limitY = Math.max(0, (rect.height * scale - rect.height) / 2);

      setPosition({
        x: Math.max(-limitX, Math.min(e.clientX - dragStart.x, limitX)),
        y: Math.max(-limitY, Math.min(e.clientY - dragStart.y, limitY))
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(src, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vetra_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <div 
      className={cn(
        "fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-black/60 backdrop-blur-3xl transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        isClosing ? "opacity-0 scale-105" : "opacity-100 animate-in fade-in duration-500"
      )}
      onClick={handleClose}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Кнопка закрытия сверху справа */}
      <button 
        className="absolute top-8 right-8 p-3 bg-white/10 backdrop-blur-xl border border-white/10 text-white rounded-[1rem] shadow-2xl transition-all duration-300 z-[2001] cursor-pointer hover:bg-white/20 hover:scale-110 active:scale-90"
        onClick={handleClose}
      >
        <X className="w-6 h-6" />
      </button>

      {/* Контейнер изображения */}
      <div 
        ref={containerRef}
        className="relative w-full h-full flex items-center justify-center p-8 md:p-20 overflow-hidden"
      >
        <AuthenticatedImage 
          src={src} 
          alt="Lightbox" 
          className={cn(
             "max-w-full max-h-full object-contain shadow-[0_64px_128px_-32px_rgba(0,0,0,0.8)] select-none",
            scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
          )}
          style={{ 
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)'
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={handleMouseDown}
        />
      </div>

      {/* Нижний интерфейс (Floating Bottom Bar) */}
      <div 
        className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-8 px-8 py-4 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-2xl pointer-events-auto animate-in slide-in-from-bottom-8 duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Информация об авторе */}
        <div className="flex flex-col pr-8 border-r border-white/10">
          <span className="text-white font-extrabold text-[1rem] tracking-tight leading-tight whitespace-nowrap">
            {author}
          </span>
          <span className="text-white/40 text-[0.75rem] font-bold uppercase tracking-widest mt-0.5">
            {time}
          </span>
        </div>

        {/* Кнопки действий */}
        <div className="flex items-center gap-4">
          <button 
            onClick={handleDownload}
            className="p-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-[0.85rem] transition-all duration-300 cursor-pointer active:scale-90"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>
          
          <button 
            onClick={handleRotate}
            className="p-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-[0.85rem] transition-all duration-300 cursor-pointer active:scale-90"
            title="Rotate 90°"
          >
            <RotateCw className="w-5 h-5" />
          </button>

          <button 
            className="p-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-[0.85rem] transition-all duration-300 cursor-pointer active:scale-90"
            title="More Options"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
