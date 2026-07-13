import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageText, parseMessageText } from "./MessageText";

const openExternalUrlMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/utils/externalLinks", () => ({ openExternalUrl: openExternalUrlMock }));

describe("MessageText", () => {
  beforeEach(() => {
    openExternalUrlMock.mockReset();
  });

  it("renders safe HTTP URLs as independent anchors and preserves surrounding text", () => {
    const text = "Open https://example.com/a/b?x=1#section then http://localhost:4000/test now";
    render(<MessageText text={text} />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "https://example.com/a/b?x=1#section",
      "http://localhost:4000/test",
    ]);
    expect(screen.getByTestId("message-rich-text")).toHaveTextContent(text);
    const link = screen.getAllByRole("link")[0] as HTMLAnchorElement;
    expect(link.style.color).toBe("inherit");
    expect(link.style.textDecorationLine).toBe("underline");
    expect(link.style.wordBreak).toBe("break-all");
  });

  it("supports the supplied IP URL and preserves newlines, spaces, and punctuation boundaries", () => {
    const text = "Open (http://146.120.249.160:8080/__manage-local),\nnext line.";
    render(<MessageText text={text} />);
    expect(screen.getByRole("link")).toHaveTextContent("http://146.120.249.160:8080/__manage-local");
    expect(screen.getByTestId("message-rich-text").textContent).toBe(text);
    expect(parseMessageText("Open https://example.com.")[1]).toMatchObject({ text: "https://example.com" });
    expect(parseMessageText("Open https://example.com/test,")[1]).toMatchObject({ text: "https://example.com/test" });
  });

  it("does not link unsupported schemes or arbitrary words", () => {
    render(<MessageText text="javascript:alert(1) data:text/plain,x file:///tmp/a example.com" />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("renders explicit links before automatic URL detection and keeps visible text unchanged", () => {
    render(<MessageText text="Открыть сайт https://example.com" entities={[{ type: "text_link", offset: 0, length: 12, url: "https://example.org/" }]} />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Открыть сайт", "https://example.com"]);
    expect(links[0]).toHaveAttribute("href", "https://example.org/");
    expect(links[0]).toHaveStyle({ wordBreak: "normal" });
    expect(screen.getByTestId("message-rich-text").textContent).toBe("Открыть сайт https://example.com");
  });

  it("opens HTTP and HTTPS links without bubbling into the message container", () => {
    const containerClick = vi.fn();
    render(<div onClick={containerClick}><MessageText text="http://example.com https://example.com" /></div>);
    const link = screen.getAllByRole("link")[0];
    fireEvent.pointerDown(link);
    fireEvent.click(link);
    expect(openExternalUrlMock).toHaveBeenCalledWith("http://example.com");
    expect(containerClick).not.toHaveBeenCalled();
  });
});
