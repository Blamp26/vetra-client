import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

vi.mock("emoji-picker-react", () => ({
  __esModule: true,
  default: () => <div data-testid="emoji-picker" />,
  Theme: { AUTO: "auto" },
  EmojiStyle: { APPLE: "apple" },
}));

import { MessageContextMenu } from "./MessageContextMenu";

describe("MessageContextMenu", () => {
  it("disables forwarding for attachment messages", () => {
    render(
      <MessageContextMenu
        data={{
          msgId: 1,
          content: null,
          x: 100,
          y: 200,
          isOwn: true,
          hasText: false,
          author: "Alice",
        }}
        isPickerExpanded={false}
        setIsPickerExpanded={vi.fn()}
        onToggleReaction={vi.fn()}
        onReply={vi.fn()}
        onCopy={vi.fn()}
        onForward={vi.fn()}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        canEdit={false}
        canForward={false}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Forward unavailable for attachments",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Forward unavailable for attachments",
      }),
    ).toHaveAttribute(
      "title",
      "Messages with attachments cannot be forwarded yet.",
    );
  });
});
