import React from 'react';
import { cn } from '@/shared/utils/cn';

interface AvatarProps {
  name?: string;
  src?: string | null;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  onClick?: () => void;
  title?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ 
  name, 
  src, 
  size = 'medium', 
  className = '', 
  onClick,
  title
}) => {
  const initials = name ? name[0].toUpperCase() : '?';
  
  const sizeClasses = {
    small: 'w-6 h-6 text-[0.7rem]',
    medium: 'w-8 h-8 text-[0.82rem]',
    large: 'w-[38px] h-[38px] text-[0.95rem]',
  };

  const combinedClassName = cn(
    'rounded-full bg-[#5865F2] text-white font-bold grid place-items-center flex-shrink-0 object-cover select-none leading-[1]',
    sizeClasses[size],
    className
  );

  if (src) {
    return (
      <img 
        src={src} 
        alt={name || 'avatar'} 
        className={combinedClassName} 
        onClick={onClick}
        title={title}
      />
    );
  }

  return (
    <span 
      className={combinedClassName} 
      onClick={onClick}
      title={title}
    >
      {initials}
    </span>
  );
};
