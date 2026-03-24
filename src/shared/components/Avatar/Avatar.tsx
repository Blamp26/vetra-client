import React from 'react';
import styles from './Avatar.module.css';

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
  
  const combinedClassName = `${styles.avatar} ${styles[size]} ${className}`;

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
