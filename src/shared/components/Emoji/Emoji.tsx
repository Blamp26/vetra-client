import React from 'react';

interface EmojiProps {
  emoji: string;
  size?: number;
  className?: string;
}

/**
 * Рендерит эмодзи в стиле Apple (iOS), используя CDN.
 */
export const Emoji: React.FC<EmojiProps> = ({ emoji, size = 20, className = "" }) => {
  // Улучшенная функция для получения кода эмодзи для CDN
  const getEmojiCode = (emoji: string) => {
    return Array.from(emoji)
      .map(char => char.codePointAt(0)?.toString(16))
      .filter(Boolean)
      .join('-');
  };

  const code = getEmojiCode(emoji);
  const url = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${code}.png`;

  return (
    <img
      src={url}
      alt={emoji}
      className={className}
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        verticalAlign: 'middle',
        position: 'relative',
        top: '-1px'
      }}
      // Если изображение не загрузилось, показываем системный эмодзи
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        target.style.display = 'none';
        const span = document.createElement('span');
        span.innerText = emoji;
        target.parentNode?.insertBefore(span, target);
      }}
    />
  );
};

export const EmojiText: React.FC<{ text: string; size?: number; className?: string }> = ({ text, size = 18, className = "" }) => {
  // Более полное регулярное выражение для эмодзи (Emoji 15.0+)
  const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}|\p{Emoji_Component})/gu;
  
  // Разделяем текст на части (текст и эмодзи)
  const parts = text.split(emojiRegex);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part && part.match(emojiRegex)) {
          return <Emoji key={i} emoji={part} size={size} />;
        }
        return part;
      })}
    </span>
  );
};
