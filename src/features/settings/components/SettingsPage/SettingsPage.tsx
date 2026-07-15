// client/src/features/settings/components/SettingsPage/SettingsPage.tsx
import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { useAppStore, type RootState } from '@/store';
import { ProfileModal } from '@/features/profile/components/ProfileModal/ProfileModal';
import { ConfirmModal } from '@/shared/components/ConfirmModal/ConfirmModal';
import { cn } from '@/shared/utils/cn';
import { Tabs, Tab, TabList, TabPanel } from '@/shared/components/Tabs';
import { Dialog } from '@/shared/components/Dialog';
import { themeLabels, type Theme } from "@/themes";
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  type NotificationPermissionStatus,
} from '@/services/notifications';

function AudioVideoSettings() {
  const { 
    availableInputDevices, 
    availableOutputDevices, 
    selectedInputDeviceId, 
    selectedOutputDeviceId,
    noiseSuppression,
    echoCancellation,
    autoGainControl,
    setInputDevice,
    setOutputDevice,
    setNoiseSuppression,
    setEchoCancellation,
    setAutoGainControl,
    refreshDevices 
  } = useAppStore((s: RootState) => ({
    availableInputDevices: s.availableInputDevices,
    availableOutputDevices: s.availableOutputDevices,
    selectedInputDeviceId: s.selectedInputDeviceId,
    selectedOutputDeviceId: s.selectedOutputDeviceId,
    noiseSuppression: s.noiseSuppression,
    echoCancellation: s.echoCancellation,
    autoGainControl: s.autoGainControl,
    setInputDevice: s.setInputDevice,
    setOutputDevice: s.setOutputDevice,
    setNoiseSuppression: s.setNoiseSuppression,
    setEchoCancellation: s.setEchoCancellation,
    setAutoGainControl: s.setAutoGainControl,
    refreshDevices: s.refreshDevices
  }));

  const [micLevel, setMicLevel] = useState(0);
  const [audioFeedback, setAudioFeedback] = useState<{
    tone: "default" | "error";
    message: string;
  } | null>(null);
  const [isMicTestActive, setIsMicTestActive] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const stopMicTest = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setMicLevel(0);
    setIsMicTestActive(false);
  }, []);

  const applyDeviceRefreshFeedback = useCallback((result: Awaited<ReturnType<typeof refreshDevices>>) => {
    if (result.permissionState === "denied") {
      setAudioFeedback({
        tone: "error",
        message: "Microphone permission denied. Allow microphone access in your browser or system settings to test input devices.",
      });
      return;
    }

    if (result.inputCount === 0) {
      setAudioFeedback({
        tone: "error",
        message: "No input devices found. Connect a microphone or verify that your OS is exposing one to the browser.",
      });
      return;
    }

    if (!result.labelsAvailable) {
      setAudioFeedback({
        tone: "default",
        message: "Device names may stay hidden until you explicitly allow microphone access. Use Allow microphone or Test microphone to unlock labels when supported.",
      });
      return;
    }

    setAudioFeedback(null);
  }, [refreshDevices]);

  useEffect(() => {
    void refreshDevices().then(applyDeviceRefreshFeedback);
  }, [applyDeviceRefreshFeedback, refreshDevices]);

  useEffect(() => stopMicTest, [stopMicTest]);

  const handleAllowMicrophone = useCallback(async () => {
    const result = await refreshDevices({ requestPermission: true });
    applyDeviceRefreshFeedback(result);
  }, [applyDeviceRefreshFeedback, refreshDevices]);

  const handleMicTestToggle = useCallback(async () => {
    if (isMicTestActive) {
      stopMicTest();
      return;
    }

    try {
      const constraints = {
        audio: {
          deviceId: selectedInputDeviceId !== 'default' ? { exact: selectedInputDeviceId } : undefined,
          noiseSuppression,
          echoCancellation,
          autoGainControl,
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const audioContext = new (window.AudioContext || (window as Window & typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      analyser.fftSize = 256;
      microphone.connect(analyser);

      stopMicTest();
      audioContextRef.current = audioContext;
      streamRef.current = stream;
      setIsMicTestActive(true);
      setAudioFeedback(null);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((accumulator, value) => accumulator + value, 0);
        const average = sum / dataArray.length;
        setMicLevel(average);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      const result = await refreshDevices({ requestPermission: true });
      applyDeviceRefreshFeedback(result);
      setAudioFeedback(null);
    } catch (err) {
      stopMicTest();
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
        setAudioFeedback({
          tone: "error",
          message: "Microphone permission denied. Allow microphone access to test your input device.",
        });
        return;
      }

      if (err instanceof DOMException && (err.name === "NotFoundError" || err.name === "OverconstrainedError")) {
        setAudioFeedback({
          tone: "error",
          message: "The selected microphone is unavailable. Choose another input device and try again.",
        });
        return;
      }

      setAudioFeedback({
        tone: "error",
        message: "Microphone test could not start in this browser or device environment.",
      });
    }
  }, [
    applyDeviceRefreshFeedback,
    autoGainControl,
    echoCancellation,
    isMicTestActive,
    noiseSuppression,
    refreshDevices,
    selectedInputDeviceId,
    stopMicTest,
  ]);

  return (
    <div className="max-w-xl">
      <h3 className="mb-4 text-xl font-semibold tracking-tight">Audio & Video</h3>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="vt-label" htmlFor="settings-audio-input">Input Device</label>
          <select 
            id="settings-audio-input"
            value={selectedInputDeviceId}
            onChange={(e) => setInputDevice(e.target.value)}
            className="vt-select"
          >
            {availableInputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || `Mic (${device.deviceId.slice(0, 5)})`}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Input device changes apply to the next call. Live microphone switching is not enabled in the current direct-call demo.
          </p>
          <div className="mt-2">
            <div className="text-[10px] text-muted-foreground mb-1">Input Level: {Math.round((micLevel / 128) * 100)}%</div>
            <div className="h-1 w-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${(micLevel / 128) * 100}%` }} />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => { void handleAllowMicrophone(); }} className="vt-button" type="button">
              Allow microphone
            </button>
            <button onClick={() => { void handleMicTestToggle(); }} className="vt-button" type="button">
              {isMicTestActive ? "Stop microphone test" : "Test microphone"}
            </button>
          </div>
          {audioFeedback && (
            <div
              className={cn(
                "rounded-[12px] border px-3 py-2 text-xs leading-5",
                audioFeedback.tone === "error"
                  ? "border-destructive/35 bg-destructive/10 text-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
              data-testid="settings-audio-feedback"
            >
              {audioFeedback.message}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <label className="vt-label" htmlFor="settings-audio-output">Output Device</label>
          <select 
            id="settings-audio-output"
            value={selectedOutputDeviceId}
            onChange={(e) => setOutputDevice(e.target.value)}
            className="vt-select"
          >
            {availableOutputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || `Speaker (${device.deviceId.slice(0, 5)})`}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Speaker routing depends on browser support and may fall back to the system default output device.
          </p>
        </div>
        <div className="vt-panel space-y-2 p-4">
          <div>
            <div className="text-sm font-medium">Microphone processing</div>
            <p className="text-xs text-muted-foreground">
              These are browser-requested audio improvements. Actual support and behavior can vary by browser and device.
            </p>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm" htmlFor="settings-noise-suppression">
            <span>Noise suppression</span>
            <input
              id="settings-noise-suppression"
              type="checkbox"
              checked={noiseSuppression}
              onChange={(e) => setNoiseSuppression(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm" htmlFor="settings-echo-cancellation">
            <span>Echo cancellation</span>
            <input
              id="settings-echo-cancellation"
              type="checkbox"
              checked={echoCancellation}
              onChange={(e) => setEchoCancellation(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm" htmlFor="settings-auto-gain-control">
            <span>Auto gain control</span>
            <input
              id="settings-auto-gain-control"
              type="checkbox"
              checked={autoGainControl}
              onChange={(e) => setAutoGainControl(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
          </label>
        </div>
        <button onClick={() => { void refreshDevices().then(applyDeviceRefreshFeedback); }} className="vt-button">Refresh devices</button>
      </div>
    </div>
  );
}

type SettingsTab = 'account' | 'appearance' | 'notifications' | 'audioVideo';

interface Props { onClose: () => void; }

export function SettingsPage({ onClose }: Props) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const logout = useAppStore((s: RootState) => s.logout);
  const theme = useAppStore((s: RootState) => s.theme);
  const setTheme = useAppStore((s: RootState) => s.setTheme);
  const [tab, setTab] = useState<SettingsTab>('account');
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionStatus | 'loading'>('loading');
  const titleId = useId();
  const accountTabRef = useRef<HTMLButtonElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);

  const refreshNotificationPermission = useCallback(async () => {
    const status = await getNotificationPermissionStatus();
    setNotificationPermission(status);
  }, []);

  useEffect(() => {
    void refreshNotificationPermission();
  }, [refreshNotificationPermission]);

  const handleNotificationPermissionRequest = useCallback(async () => {
    await requestNotificationPermission();
    await refreshNotificationPermission();
  }, [refreshNotificationPermission]);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'account', label: 'Account' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'audioVideo', label: 'Audio & Video' },
  ];

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={accountTabRef as React.RefObject<HTMLElement>}
      backdropClassName="vt-dialog-backdrop--settings"
      className="vt-modal-panel relative z-10 flex h-[82vh] w-full max-w-5xl overflow-hidden"
    >
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as SettingsTab)}
          orientation="vertical"
          className="flex h-full w-full"
        >
        <div className="flex w-72 flex-col border-r border-border bg-sidebar/60 px-4 py-5">
          <div className="mb-5">
            <span className="vt-kicker">Preferences</span>
            <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-tight">Settings</h2>
          </div>
          <TabList aria-label="Settings sections" className="flex flex-col gap-1">
            {tabs.map((t) => (
              <Tab
                key={t.id}
                value={t.id}
                className={cn(
                  "vt-button min-h-10 justify-start px-3 text-left text-sm",
                  tab === t.id ? "vt-button--primary" : "vt-button--ghost border-transparent",
                )}
              >{t.label}</Tab>
            ))}
          </TabList>
          <div className="mt-auto flex flex-col gap-2">
            <button onClick={() => setShowLogoutConfirm(true)} className="vt-button vt-button--danger justify-start">Log Out</button>
            <button onClick={onClose} className="vt-button justify-start">Back</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-7">
          <TabPanel value="account" className="max-w-xl space-y-4">
          {currentUser && (
            <div className="max-w-xl space-y-4">
              <h3 className="text-xl font-semibold tracking-tight">Account</h3>
              <div className="vt-panel flex items-center gap-4 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-primary text-primary-foreground">
                  {(currentUser.display_name || currentUser.username)[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{currentUser.display_name || currentUser.username}</div>
                  <div className="text-xs text-muted-foreground">@{currentUser.username}</div>
                </div>
                <button ref={profileTriggerRef} onClick={() => setShowEditProfile(true)} className="vt-button">Edit</button>
              </div>
              <div className="vt-panel overflow-hidden">
                <div className="flex justify-between border-b border-border px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Username</span>
                  <span>@{currentUser.username}</span>
                </div>
                <div className="flex justify-between px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Display Name</span>
                  <span>{currentUser.display_name || '—'}</span>
                </div>
              </div>
            </div>
          )}
          </TabPanel>
          <TabPanel value="appearance" className="max-w-xl space-y-4">
            <div className="max-w-xl space-y-4">
              <h3 className="text-xl font-semibold tracking-tight">Appearance</h3>
              <div className="flex gap-2">
                {(['light', 'dark'] as Theme[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={cn("vt-button flex-1", theme === t ? "vt-button--primary" : "")}
                  >{themeLabels[t]}</button>
                ))}
              </div>
            </div>
          </TabPanel>
          <TabPanel value="notifications" className="max-w-xl space-y-4">
            <div className="max-w-xl space-y-4">
              <h3 className="text-xl font-semibold tracking-tight">Notifications</h3>
              <div className="vt-panel space-y-3 p-4">
                <div>
                  <div className="text-sm font-medium">Desktop notifications</div>
                  <p className="text-xs text-muted-foreground">
                    {notificationPermission === 'granted' && 'Desktop notifications are enabled.'}
                    {notificationPermission === 'default' && 'Desktop notifications are off until you enable them here.'}
                    {notificationPermission === 'denied' && 'Desktop notifications are blocked. Update your browser or system notification settings to re-enable them.'}
                    {notificationPermission === 'unsupported' && 'This environment does not support desktop notifications.'}
                    {notificationPermission === 'loading' && 'Checking notification support...'}
                  </p>
                </div>
                {notificationPermission === 'default' && (
                  <button
                    onClick={() => { void handleNotificationPermissionRequest(); }}
                    className="vt-button"
                  >
                    Enable notifications
                  </button>
                )}
              </div>
            </div>
          </TabPanel>
          <TabPanel value="audioVideo">
            <AudioVideoSettings />
          </TabPanel>
        </div>
        </Tabs>
      {showEditProfile && currentUser && <ProfileModal user={currentUser} onClose={() => setShowEditProfile(false)} />}
      {showLogoutConfirm && (
        <ConfirmModal
          title="Log out?"
          message="Are you sure?"
          confirmLabel="Log Out"
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={() => { setShowLogoutConfirm(false); logout(); onClose(); }}
        />
      )}
    </Dialog>
  );
}
