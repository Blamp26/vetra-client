import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const { useAppStoreMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
}));

const {
  getNotificationPermissionStatusMock,
  requestNotificationPermissionMock,
} = vi.hoisted(() => ({
  getNotificationPermissionStatusMock: vi.fn(),
  requestNotificationPermissionMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));

vi.mock("@/features/profile/components/ProfileModal/ProfileModal", () => ({
  ProfileModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Profile modal">
      <button type="button" onClick={onClose}>Close profile</button>
    </div>
  ),
}));

vi.mock("@/shared/components/ConfirmModal/ConfirmModal", () => ({
  ConfirmModal: ({ title, onCancel, onConfirm }: {
    title: string;
    onCancel: () => void;
    onConfirm: () => void;
  }) => (
    <div role="dialog" aria-label={title}>
      <h2>{title}</h2>
      <button type="button" onClick={onCancel}>Cancel logout</button>
      <button type="button" onClick={onConfirm}>Confirm logout</button>
    </div>
  ),
}));

vi.mock("@/services/notifications", () => ({
  getNotificationPermissionStatus: getNotificationPermissionStatusMock,
  requestNotificationPermission: requestNotificationPermissionMock,
}));

import { SettingsPage } from "./SettingsPage";

class MockAudioContext {
  createAnalyser() {
    return {
      fftSize: 0,
      frequencyBinCount: 8,
      getByteFrequencyData: (array: Uint8Array) => array.fill(0),
    };
  }

  createMediaStreamSource() {
    return {
      connect: vi.fn(),
    };
  }

  close() {
    return Promise.resolve();
  }
}

describe("SettingsPage audio settings", () => {
  let storeState: any;

  beforeEach(() => {
    vi.clearAllMocks();
    getNotificationPermissionStatusMock.mockResolvedValue("granted");
    requestNotificationPermissionMock.mockResolvedValue(true);

    Object.defineProperty(global.navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
      writable: true,
    });

    Object.defineProperty(window, "AudioContext", {
      value: MockAudioContext,
      writable: true,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      value: MockAudioContext,
      writable: true,
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    storeState = {
      currentUser: { id: 1, username: "tester", display_name: "Tester" },
      logout: vi.fn(),
      theme: "light",
      setTheme: vi.fn(),
      availableInputDevices: [{ deviceId: "default", label: "Default Mic" }],
      availableOutputDevices: [{ deviceId: "default", label: "Default Speaker" }],
      selectedInputDeviceId: "default",
      selectedOutputDeviceId: "default",
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
      setInputDevice: vi.fn(),
      setOutputDevice: vi.fn(),
      setNoiseSuppression: vi.fn(),
      setEchoCancellation: vi.fn(),
      setAutoGainControl: vi.fn(),
      refreshDevices: vi.fn().mockResolvedValue({
        permissionState: "not-requested",
        labelsAvailable: true,
        inputCount: 1,
        outputCount: 1,
      }),
    };

    useAppStoreMock.mockImplementation((selector: (state: typeof storeState) => unknown) =>
      selector(storeState),
    );
  });

  it("exposes vertical settings tabs with a single initially focusable selection", () => {
    render(<SettingsPage onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByText("Preferences")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    const tablist = screen.getByRole("tablist", { name: "Settings sections" });
    const tabs = screen.getAllByRole("tab");
    expect(tablist).toHaveAttribute("aria-orientation", "vertical");
    expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true");
    expect(tabs.filter((tab) => tab.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(screen.queryByRole("tab", { name: "Profile" })).not.toBeInTheDocument();
    tabs.forEach((tab) => expect(document.getElementById(tab.getAttribute("aria-controls")!)).toBeInTheDocument());
  });

  it("closes through the visible close control", () => {
    const onClose = vi.fn();
    render(<SettingsPage onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("consolidates account identity and keeps profile and logout actions in Account", () => {
    render(<SettingsPage onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByText("Tester")).toBeInTheDocument();
    expect(screen.getAllByText("@tester")).toHaveLength(1);
    expect(screen.queryByText("Display Name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log Out" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Profile modal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log Out" })).toBeInTheDocument();
  });

  it("keeps logout confirmation and closes Settings after confirmation", () => {
    const onClose = vi.fn();
    render(<SettingsPage onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Log Out" }));
    expect(screen.getByRole("dialog", { name: "Log out?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm logout" }));
    expect(storeState.logout).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the Light and Dark theme actions wired to the store", () => {
    render(<SettingsPage onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    fireEvent.click(screen.getByRole("button", { name: "Light" }));

    expect(storeState.setTheme).toHaveBeenNthCalledWith(1, "dark");
    expect(storeState.setTheme).toHaveBeenNthCalledWith(2, "light");
  });

  it("uses the shared named dialog and focuses the Account tab initially", () => {
    const onClose = vi.fn();
    render(<SettingsPage onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Account" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses vertical keyboard navigation and mounts audio settings only when selected", async () => {
    render(<SettingsPage onClose={vi.fn()} />);

    const account = screen.getByRole("tab", { name: "Account" });
    fireEvent.keyDown(account, { key: "ArrowDown" });
    expect(screen.getByRole("tab", { name: "Appearance" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Appearance" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Audio & Video" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Audio & Video" })).toBeInTheDocument();

    await waitFor(() => expect(storeState.refreshDevices).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(screen.getByRole("tab", { name: "Audio & Video" }), { key: "ArrowUp" });
    expect(screen.queryByRole("heading", { name: "Audio & Video" })).not.toBeInTheDocument();
    expect(storeState.refreshDevices).toHaveBeenCalledTimes(1);
  });

  it("renders microphone processing toggles and helper text", () => {
    render(<SettingsPage onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Audio & Video" }));

    expect(screen.getByLabelText("Noise suppression")).toBeChecked();
    expect(screen.getByLabelText("Echo cancellation")).toBeChecked();
    expect(screen.getByLabelText("Auto gain control")).toBeChecked();
    expect(
      screen.getByText(/actual support and behavior can vary by browser and device/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/speaker routing depends on browser support/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/input device changes apply to the next call/i),
    ).toBeInTheDocument();
    const processingGroup = screen.getByRole("group", { name: "Microphone processing" });
    expect(processingGroup).toBeInTheDocument();
    expect(processingGroup).not.toHaveClass("vt-panel");
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("keeps audio actions accessible and wired to their existing handlers", async () => {
    render(<SettingsPage onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Audio & Video" }));

    expect(screen.getByRole("button", { name: "Allow microphone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test microphone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh devices" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Input level" })).toHaveAttribute("aria-valuenow", "0");

    fireEvent.click(screen.getByRole("button", { name: "Allow microphone" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh devices" }));

    await waitFor(() => {
      expect(storeState.refreshDevices).toHaveBeenCalledWith({ requestPermission: true });
      expect(storeState.refreshDevices).toHaveBeenCalledWith();
    });
  });

  it("switches the microphone test action label while the test is active", async () => {
    render(<SettingsPage onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Audio & Video" }));
    fireEvent.click(screen.getByRole("button", { name: "Test microphone" }));

    expect(await screen.findByRole("button", { name: "Stop microphone test" })).toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Stop microphone test" }));
    expect(screen.getByRole("button", { name: "Test microphone" })).toBeInTheDocument();
  });

  it("does not request microphone access just by opening audio settings", async () => {
    render(<SettingsPage onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Audio & Video" }));

    await waitFor(() => {
      expect(storeState.refreshDevices).toHaveBeenCalledWith();
    });
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("shows device-label help when browser enumeration stays limited", async () => {
    storeState.refreshDevices.mockResolvedValue({
      permissionState: "not-requested",
      labelsAvailable: false,
      inputCount: 1,
      outputCount: 1,
    });

    render(<SettingsPage onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Audio & Video" }));

    const feedback = await screen.findByTestId("settings-audio-feedback");
    expect(feedback).toHaveTextContent(
      /device names may stay hidden until you explicitly allow microphone access/i,
    );
    expect(feedback).toHaveRole("status");
  });

  it("surfaces microphone permission errors from explicit actions", async () => {
    storeState.refreshDevices.mockResolvedValue({
      permissionState: "denied",
      labelsAvailable: false,
      inputCount: 0,
      outputCount: 1,
    });

    render(<SettingsPage onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Audio & Video" }));
    fireEvent.click(screen.getByRole("button", { name: "Allow microphone" }));

    const feedback = await screen.findByTestId("settings-audio-feedback");
    expect(feedback).toHaveTextContent(
      /microphone permission denied/i,
    );
    expect(feedback).toHaveRole("alert");
  });

  it("calls store setters when microphone processing toggles change", () => {
    render(<SettingsPage onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Audio & Video" }));

    fireEvent.click(screen.getByLabelText("Noise suppression"));
    fireEvent.click(screen.getByLabelText("Echo cancellation"));
    fireEvent.click(screen.getByLabelText("Auto gain control"));

    expect(storeState.setNoiseSuppression).toHaveBeenCalledWith(false);
    expect(storeState.setEchoCancellation).toHaveBeenCalledWith(false);
    expect(storeState.setAutoGainControl).toHaveBeenCalledWith(false);
  });

  it("requests notification permission only from the notifications settings action", async () => {
    getNotificationPermissionStatusMock
      .mockResolvedValueOnce("default")
      .mockResolvedValueOnce("granted");

    render(<SettingsPage onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Notifications" }));

    expect(requestNotificationPermissionMock).not.toHaveBeenCalled();

    const enableButton = await screen.findByRole("button", { name: "Enable notifications" });
    fireEvent.click(enableButton);

    expect(requestNotificationPermissionMock).toHaveBeenCalledTimes(1);
  });
});
