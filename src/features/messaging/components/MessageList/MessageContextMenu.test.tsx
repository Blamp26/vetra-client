import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("emoji-picker-react", () => ({
  __esModule: true,
  default: () => <div data-testid="emoji-picker" />,
  Theme: { AUTO: "auto" },
  EmojiStyle: { APPLE: "apple" },
}));

import { MessageContextMenu } from "./MessageContextMenu";

describe("MessageContextMenu", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 240,
      right: 256,
      width: 256,
      height: 240,
      toJSON: () => ({}),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  function renderMenu(
    dataOverrides: Partial<Parameters<typeof MessageContextMenu>[0]["data"]> = {},
    propOverrides: Partial<Omit<Parameters<typeof MessageContextMenu>[0], "data">> = {},
  ) {
    render(
      <MessageContextMenu
        data={{
          msgId: 1,
          content: "Hello",
          x: 100,
          y: 200,
          isOwn: true,
          hasText: true,
          author: "Alice",
          ...dataOverrides,
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
        canEdit={true}
        canForward={true}
        onClose={vi.fn()}
        {...propOverrides}
      />,
    );
  }

  it("keeps a normal click position when there is room in the viewport", () => {
    renderMenu({ x: 120, y: 140 });

    expect(screen.getByTestId("message-context-menu")).toHaveStyle({
      left: "120px",
      top: "140px",
    });
  });

  it("flips left when opened near the right edge", () => {
    renderMenu({ x: 980, y: 140 });

    expect(screen.getByTestId("message-context-menu")).toHaveStyle({
      left: "724px",
      top: "140px",
    });
  });

  it("flips upward when opened near the bottom edge", () => {
    renderMenu({ x: 120, y: 780 });

    expect(screen.getByTestId("message-context-menu")).toHaveStyle({
      left: "120px",
      top: "540px",
    });
  });

  it("disables forwarding for attachment messages", () => {
    renderMenu({ content: null, hasText: false }, { canEdit: false, canForward: false });

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

  it("renders the existing core actions", () => {
    renderMenu();

    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forward" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
