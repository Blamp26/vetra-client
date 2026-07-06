import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("emoji-picker-react", () => ({
  __esModule: true,
  default: () => <div data-testid="emoji-picker" />,
  Theme: { AUTO: "auto" },
  EmojiStyle: { APPLE: "apple" },
}));

import { MessageContextMenu, calculateContextMenuPosition, type Rect } from "./MessageContextMenu";

function menuRect(position: { left: number; top: number }, width = 256, height = 240): Rect {
  return {
    left: position.left,
    top: position.top,
    right: position.left + width,
    bottom: position.top + height,
    width,
    height,
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

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

  it("keeps the outgoing message menu off the message text while staying near the bubble", () => {
    const contentRect = {
      left: 720,
      top: 140,
      right: 900,
      bottom: 220,
      width: 180,
      height: 80,
    };
    const position = calculateContextMenuPosition({
      x: 900,
      y: 160,
      menuWidth: 256,
      menuHeight: 240,
      viewportWidth: 1000,
      viewportHeight: 800,
      contentRect,
      isOwn: true,
    });

    expect(position.left).toBe(464);
    expect(intersects(menuRect(position), contentRect)).toBe(false);
  });

  it("keeps the incoming message menu off the message text while staying near the bubble", () => {
    const contentRect = {
      left: 100,
      top: 180,
      right: 320,
      bottom: 260,
      width: 220,
      height: 80,
    };
    const position = calculateContextMenuPosition({
      x: 120,
      y: 200,
      menuWidth: 256,
      menuHeight: 240,
      viewportWidth: 1000,
      viewportHeight: 800,
      contentRect,
      isOwn: false,
    });

    expect(position.left).toBe(320);
    expect(intersects(menuRect(position), contentRect)).toBe(false);
  });

  it("keeps the reaction row and full menu inside the viewport near the bottom edge", () => {
    const position = calculateContextMenuPosition({
      x: 980,
      y: 780,
      menuWidth: 256,
      menuHeight: 240,
      viewportWidth: 1000,
      viewportHeight: 800,
      contentRect: {
        left: 760,
        top: 720,
        right: 940,
        bottom: 780,
        width: 180,
        height: 60,
      },
      isOwn: true,
    });

    expect(position.left).toBeGreaterThanOrEqual(8);
    expect(position.top).toBeGreaterThanOrEqual(8);
    expect(position.left + 256).toBeLessThanOrEqual(992);
    expect(position.top + 240).toBeLessThanOrEqual(792);
  });

  it("still clamps inside the viewport when the preferred side would overflow", () => {
    const position = calculateContextMenuPosition({
      x: 990,
      y: 790,
      menuWidth: 256,
      menuHeight: 240,
      viewportWidth: 1000,
      viewportHeight: 800,
      contentRect: {
        left: 820,
        top: 730,
        right: 980,
        bottom: 790,
        width: 160,
        height: 60,
      },
      isOwn: false,
    });

    expect(position.left).toBeGreaterThanOrEqual(8);
    expect(position.top).toBeGreaterThanOrEqual(8);
    expect(position.left + 256).toBeLessThanOrEqual(992);
    expect(position.top + 240).toBeLessThanOrEqual(792);
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
