import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConversationHeaderShell } from "./ConversationHeaderShell";
import { ConversationDateSeparator } from "./ConversationDateSeparator";
import { ConversationMessageGroup } from "./ConversationMessageGroup";
import { ConversationTimeline } from "./ConversationTimeline";
import { ConversationComposerBar, ConversationComposerShell } from "./ConversationComposerShell";

describe("conversation presentation primitives", () => {
  it("provides the shared header geometry and slots", () => {
    render(<ConversationHeaderShell avatar={<span>avatar</span>} title="Title" subtitle="Subtitle" actions={<button>Action</button>} />);
    expect(screen.getByTestId("chat-header").className).toContain("h-[54px]");
    expect(screen.getByTestId("chat-header").className).toContain("px-4");
    expect(screen.getByTestId("chat-header-actions").textContent).toContain("Action");
  });

  it("exposes a keyboard-accessible identity trigger without changing header geometry", () => {
    const onClick = vi.fn();
    render(<ConversationHeaderShell avatar={<span>avatar</span>} title="Group" subtitle="Group chat" actions={<button>Action</button>} identityProps={{ onClick }} />);
    const identity = screen.getByRole("button", { name: /Group Group chat/ });
    fireEvent.click(identity);
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByTestId("chat-header").className).toContain("h-[54px]");
  });

  it("keeps header identity layers mounted while exposing only the active layer", () => {
    const { rerender } = render(
      <ConversationHeaderShell
        avatar={null}
        title=""
        subtitle=""
        actions={<button type="button">Action</button>}
        identityLayers={(
          <div data-testid="identity-layers">
            <div data-identity-layer="direct" data-active="true" aria-hidden="false">Direct</div>
            <div data-identity-layer="server-channel" data-active="false" aria-hidden="true">Server</div>
          </div>
        )}
      />,
    );

    const header = screen.getByTestId("chat-header");
    const direct = screen.getByTestId("identity-layers").querySelector('[data-identity-layer="direct"]');
    const server = screen.getByTestId("identity-layers").querySelector('[data-identity-layer="server-channel"]');
    expect(header.className).toContain("h-[54px]");
    expect(direct?.getAttribute("aria-hidden")).toBe("false");
    expect(server?.getAttribute("aria-hidden")).toBe("true");

    rerender(
      <ConversationHeaderShell
        avatar={null}
        title=""
        subtitle=""
        actions={<button type="button">Action</button>}
        identityLayers={(
          <div data-testid="identity-layers">
            <div data-identity-layer="direct" data-active="false" aria-hidden="true">Direct</div>
            <div data-identity-layer="server-channel" data-active="true" aria-hidden="false">Server</div>
          </div>
        )}
      />,
    );

    expect(screen.getByTestId("chat-header")).toBe(header);
    expect(screen.getByTestId("identity-layers").querySelector('[data-identity-layer="direct"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("identity-layers").querySelector('[data-identity-layer="server-channel"]')?.getAttribute("aria-hidden")).toBe("false");
  });

  it("provides the shared timeline, date, and grouping geometry", () => {
    render(<ConversationTimeline alignmentMode="left-column" hasContent emptyState={<span>empty</span>}><ConversationDateSeparator date="Today" /><ConversationMessageGroup index={0} isConsecutive={false} isAlbumBoundary={false} isAttachmentRun={false}><span>message</span></ConversationMessageGroup></ConversationTimeline>);
    expect(screen.getByTestId("message-list-scroll").className).toContain("px-3");
    expect(screen.getByTestId("message-list-scroll").className).toContain("pt-4");
    expect(screen.getByTestId("message-list-scroll").className).toContain("pb-2");
    expect(screen.getByTestId("message-list-rail").getAttribute("data-alignment-mode")).toBe("left-column");
    expect(screen.getByTestId("message-date-separator").textContent).toContain("Today");
    expect(screen.getByTestId("message-row-spacing").className).toContain("mt-0");
  });

  it("provides the shared composer shell and bar geometry", () => {
    render(<ConversationComposerShell><ConversationComposerBar><span>controls</span></ConversationComposerBar></ConversationComposerShell>);
    expect(screen.getByTestId("message-composer-shell").className).toContain("border-t");
    expect(screen.getByTestId("message-composer-bar").className).toContain("min-h-[46px]");
    expect(screen.getByTestId("message-composer-bar").className).toContain("px-2");
  });
});
