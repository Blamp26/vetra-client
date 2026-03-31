import React from 'react';
import { cn } from '@/shared/utils/cn';
import { AuthenticatedImage } from '../AuthenticatedImage';

interface AvatarProps {
  name?: string;
  src?: string | null;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  onClick?: () => void;
  title?: string;
  status?: 'online' | 'offline' | 'dnd' | 'away' | null;
}

export const Avatar: React.FC<AvatarProps> = ({ 
  name, 
  src, 
  size = 'medium', 
  className = '', 
  onClick,
  title,
  status
}) => {
  const initials = name ? name[0].toUpperCase() : '?';
  
  const sizeClasses = {
    small: 'w-6 h-6 text-xs',
    medium: 'w-8 h-8 text-sm',
    large: 'w-10 h-10 text-base',
  };

  const combinedClassName = cn(
    'rounded-full bg-primary text-primary-foreground font-bold grid place-items-center flex-shrink-0 object-cover select-none leading-[1]',
    sizeClasses[size],
    className
  );

  const statusColors = {
    online: 'bg-online',
    offline: 'bg-offline',
    dnd: 'bg-busy',
    away: 'bg-away',
  };

  const renderStatus = () => {
    if (!status) return null;
    return (
      <span className={cn(
        "absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background",
        size === 'small' ? 'h-2 w-2 border-1' : 'h-3 w-3',
        statusColors[status]
      )} />
    );
  };

  const content = src ? (
    <AuthenticatedImage 
      data-slot="avatar"
      src={src} 
      alt={name || 'avatar'} 
      className={combinedClassName} 
      onClick={onClick}
      title={title}
    />
  ) : (
    <span 
      data-slot="avatar"
      className={combinedClassName} 
      onClick={onClick}
      title={title}
    >
      {initials}
    </span>
  );

  return (
    <div className="relative inline-block shrink-0">
      {content}
      {renderStatus()}
    </div>
  );
};
