import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import {
  PersistentCallBoundaryDebugProvider,
  type PersistentCallBoundaryDebugSnapshot,
} from "../context/PersistentCallContext";
import {
  getDirectedCallDiagnosticTimeline,
  recordDirectedCallDiagnostic,
  resetDirectedCallDiagnosticTimeline,
} from "../services/directedCallDiagnostics";
import * as callDebug from "../utils/callDebug";
import { PersistentCallDebugPanel, PersistentCallDiagnosticsShortcut } from "./PersistentCallDebugPanel";

const baseBoundary: PersistentCallBoundaryDebugSnapshot = {
  mode: "persistent",
  tauriDetected: true,
  ownershipBackend: "native",
  ownershipState: "owner",
  ownershipFailureReason: null,
  runtimeConstructed: true,
  contextMounted: false,
  currentUserPublicUuidValid: true,
  stableDeviceUuidValid: true,
  nativeHolderPresent: true,
  currentFrontendGeneration: 3,
  currentLeaseSuffix: null,
  lastOwnershipEvent: null,
  ownershipEventTimeline: [],
  directedCallEventTimeline: [],
  directedCallDiagnosticsEnabled: false,
};

function Harness({ boundary = baseBoundary }: { boundary?: PersistentCallBoundaryDebugSnapshot }) {
  const [enabled, setEnabled] = useState(callDebug.isCallDebugEnabled);
  useEffect(() => callDebug.subscribeToCallDebugState(setEnabled), []);
  const value = { ...boundary, directedCallDiagnosticsEnabled: enabled };
  return (
    <PersistentCallBoundaryDebugProvider value={value}>
      <PersistentCallDiagnosticsShortcut />
      <PersistentCallDebugPanel
        activeChatType="direct"
        directChat
        peerUuidSource="partnerRef"
        peerUuidValid
        finalButtonPredicate
      />
    </PersistentCallBoundaryDebugProvider>
  );
}

function pressShortcut(options: KeyboardEventInit = {}) {
  fireEvent.keyDown(window, { key: "d", ctrlKey: true, shiftKey: true, altKey: true, ...options });
}

describe("PersistentCallDiagnosticsShortcut", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    callDebug.setCallDebugEnabled(false);
    resetDirectedCallDiagnosticTimeline();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    callDebug.setCallDebugEnabled(false);
    resetDirectedCallDiagnosticTimeline();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("enables a production-like Tauri panel, clears stale entries, and disables on the second chord", async () => {
    callDebug.setCallDebugEnabled(true);
    recordDirectedCallDiagnostic("media_phase", { reason: "stale" });
    callDebug.setCallDebugEnabled(false);
    const view = render(<Harness />);

    pressShortcut();
    await waitFor(() => expect(screen.getByTestId("persistent-call-debug-panel")).toBeInTheDocument());
    expect(callDebug.isCallDebugEnabled()).toBe(true);
    expect(getDirectedCallDiagnosticTimeline()).toEqual([]);
    expect(screen.getByTestId("persistent-call-debug-panel")).toHaveTextContent("disable diagnostics:Ctrl+Shift+Alt+D");

    pressShortcut();
    expect(callDebug.isCallDebugEnabled()).toBe(true);
    fireEvent.keyUp(window, { key: "d" });
    pressShortcut();
    await waitFor(() => expect(screen.queryByTestId("persistent-call-debug-panel")).not.toBeInTheDocument());
    expect(callDebug.isCallDebugEnabled()).toBe(false);
    expect(getDirectedCallDiagnosticTimeline()).toEqual([]);
    view.unmount();
    render(<Harness />);
    expect(screen.queryByTestId("persistent-call-debug-panel")).not.toBeInTheDocument();
  });

  it("persists enabled state across remount and installs one deterministic listener", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const first = render(<Harness />);
    pressShortcut();
    await waitFor(() => expect(screen.getByTestId("persistent-call-debug-panel")).toBeInTheDocument());
    expect(addSpy.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    first.unmount();
    expect(removeSpy.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);

    render(<Harness />);
    expect(screen.getByTestId("persistent-call-debug-panel")).toBeInTheDocument();
    expect(addSpy.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(2);
  });

  it("does not install in browser or legacy authority paths", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const { unmount } = render(<Harness boundary={{ ...baseBoundary, tauriDetected: false }} />);
    pressShortcut();
    expect(callDebug.isCallDebugEnabled()).toBe(false);
    expect(addSpy.mock.calls.some(([type]) => type === "keydown")).toBe(false);
    unmount();

    render(<Harness boundary={{ ...baseBoundary, mode: "disabled" }} />);
    pressShortcut();
    expect(callDebug.isCallDebugEnabled()).toBe(false);
  });

  it("swallows diagnostics API failures without affecting call state", () => {
    const setEnabled = vi.spyOn(callDebug, "setCallDebugEnabled").mockImplementation(() => {
      throw new Error("diagnostic storage failure");
    });
    expect(() => render(<Harness />)).not.toThrow();
    expect(() => pressShortcut()).not.toThrow();
    expect(setEnabled).toHaveBeenCalledTimes(1);
  });
});
