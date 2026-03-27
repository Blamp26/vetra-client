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
 * Полноэкранный просмотр изображений (Lightbox)
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

  // Обработка клавиши Escape для закрытия
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    // Блокируем скролл фона
    document.body.style.overflow = 'hidden';
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, []);

  // Зум через Ctrl + Колесо (относительно курсора)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        const rect = container.getBoundingClientRect();
        
        // Координаты мыши относительно центра контейнера
        const mouseX = e.clientX - (rect.left + rect.width / 2);
        const mouseY = e.clientY - (rect.top + rect.height / 2);

        setScale(prevScale => {
          const nextScale = Math.max(1, Math.min(prevScale + delta, 5));
          
          if (nextScale === 1) {
            setPosition({ x: 0, y: 0 });
            return 1;
          }

          // Вычисляем новое смещение, чтобы точка под курсором осталась на месте
          const ratio = nextScale / prevScale;
          
          setPosition(prevPos => {
            const nextX = mouseX - (mouseX - prevPos.x) * ratio;
            const nextY = mouseY - (mouseY - prevPos.y) * ratio;

            // Строгие лимиты: фото не может уйти за края контейнера
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
    setTimeout(onClose, 200); // Даем время для анимации выхода
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
      
      // Максимальное смещение: (ширина_фото_с_зумом - ширина_контейнера) / 2
      // Если результат отрицательный (фото меньше контейнера), смещение 0
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
        "fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm transition-opacity duration-200",
        isClosing ? "opacity-0" : "opacity-100 animate-in fade-in"
      )}
      onClick={handleClose}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Кнопка закрытия сверху справа */}
      <button 
        className="absolute top-6 right-6 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all z-[2001] cursor-pointer"
        onClick={handleClose}
      >
        <X className="w-6 h-6" />
      </button>

      {/* Контейнер изображения */}
      <div 
        ref={containerRef}
        className="relative w-full h-full flex items-center justify-center p-12 md:p-24 overflow-hidden"
      >
        <AuthenticatedImage 
          src={src} 
          alt="Lightbox" 
          className={cn(
            "max-w-full max-h-full object-contain transition-transform duration-300 shadow-2xl select-none",
            scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
          )}
          style={{ 
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0, 0.2, 1)'
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={handleMouseDown}
        />
      </div>

      {/* Нижний интерфейс */}
      <div 
        className="absolute bottom-0 left-0 right-0 p-6 flex items-end justify-between bg-gradient-to-t from-black/60 to-transparent pointer-events-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Информация об авторе (слева снизу) */}
        <div className="flex flex-col gap-1 pointer-events-auto">
          <span className="text-white font-medium text-lg drop-shadow-md">
            {author}
          </span>
          <span className="text-white/60 text-sm">
            {time}
          </span>
        </div>

        {/* Кнопки действий (справа снизу) */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button 
            onClick={handleDownload}
            className="p-3 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer group flex flex-col items-center"
            title="Скачать"
          >
            <Download className="w-6 h-6" />
          </button>
          
          <button 
            onClick={handleRotate}
            className="p-3 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer group flex flex-col items-center"
            title="Повернуть на 90°"
          >
            <RotateCw className="w-6 h-6" />
          </button>

          <button 
            className="p-3 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer group flex flex-col items-center"
            title="Больше"
          >
            <MoreHorizontal className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
