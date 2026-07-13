import type { ReactNode } from "react";
import type { MessageReactionGroup } from "@/shared/types";
import { Emoji } from "@/shared/components/Emoji/Emoji";

interface Props {
  messageId: number;
  reactions: MessageReactionGroup[];
  onToggle: (reaction: string) => void;
  metadata?: ReactNode;
}

export function MessageReactions({
  messageId,
  reactions,
  onToggle,
  metadata,
}: Props) {
  if (reactions.length === 0) return null;

  return (
    <div
      className="message-reactions"
      data-testid="message-reactions"
      role="group"
      aria-label="Message reactions"
    >
      {reactions.map((item) => {
        const reaction = item.reaction ?? item.emoji ?? "";
        return (
          <button
            type="button"
            key={`${messageId}:${reaction}`}
            className={`message-reactions__pill${item.chosen ? " is-chosen" : ""}`}
            aria-pressed={item.chosen}
            aria-label={`${item.chosen ? "Remove" : "Add"} ${reaction} reaction, ${item.count} reactions`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(reaction);
            }}
          >
            <span className="message-reactions__emoji-wrapper">
              <Emoji
                emoji={reaction}
                size={18}
                className="message-reactions__emoji"
              />
            </span>
            <span className="message-reactions__count">{item.count}</span>
          </button>
        );
      })}
      {metadata}
    </div>
  );
}
