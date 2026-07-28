import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { ParticipantTile } from "./ParticipantTile";

describe("ParticipantTile speaking presentation", () => {
  it("uses local and remote speaking text for screen-share participants", () => {
    const stream = {} as MediaStream;
    const { rerender } = render(
      <ParticipantTile
        name="You"
        label="You"
        variant="screenShare"
        stream={stream}
        screenShareState="watchingInline"
        isLocalSharer
        isSpeaking
      />,
    );
    expect(screen.getByText("You are speaking")).toBeInTheDocument();
    expect(screen.queryByText("You is speaking")).not.toBeInTheDocument();

    rerender(
      <ParticipantTile
        name="Alice"
        label="Alice"
        variant="screenShare"
        stream={stream}
        screenShareState="watchingInline"
        isSpeaking
      />,
    );
    expect(screen.getByText("Alice is speaking")).toBeInTheDocument();
  });

  it("marks speaking rings with the forced-colors-compatible class", () => {
    render(<ParticipantTile name="Alice" label="Alice" variant="avatar" isSpeaking />);
    expect(screen.getByTestId("participant-tile").firstElementChild).toHaveClass("vt-speaking-indicator");
  });
});
