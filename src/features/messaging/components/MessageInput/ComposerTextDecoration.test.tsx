import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { ComposerTextDecoration } from "./ComposerTextDecoration";

describe("ComposerTextDecoration", () => {
  it("colors only explicit UTF-16 text-link ranges", () => {
    render(
      <ComposerTextDecoration
        text="🙂 Open site and docs"
        entities={[
          { type: "text_link", offset: 3, length: 9, url: "https://example.com/" },
          { type: "text_link", offset: 17, length: 4, url: "https://docs.example.com/" },
        ]}
      />,
    );

    expect(screen.getByTestId("composer-text-decoration")).toHaveTextContent("🙂 Open site and docs");
    expect(screen.getByTestId("composer-text-link-3-12")).toHaveTextContent("Open site");
    expect(screen.getByTestId("composer-text-link-17-21")).toHaveTextContent("docs");
  });

  it("keeps the visible text unchanged when a link URL changes", () => {
    render(
      <ComposerTextDecoration
        text="Open site"
        entities={[{ type: "text_link", offset: 0, length: 9, url: "https://new.example/" }]}
      />,
    );

    expect(screen.getByTestId("composer-text-decoration")).toHaveTextContent("Open site");
    expect(screen.queryByText("https://new.example/")).not.toBeInTheDocument();
  });
});
