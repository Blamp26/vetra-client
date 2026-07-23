// client/src/features/settings/components/SettingsPage/SettingsPage.tsx
import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { useAppStore, type RootState } from '@/store';
import { ProfileModal } from '@/features/profile/components/ProfileModal/ProfileModal';
import { ConfirmModal } from '@/shared/components/ConfirmModal/ConfirmModal';
import { cn } from '@/shared/utils/cn';
import { Tabs, Tab, TabList, TabPanel } from '@/shared/components/Tabs';
import { Dialog } from '@/shared/components/Dialog';
import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import { Avatar } from '@/shared/components/Avatar';
import { X } from 'lucide-react';
import { themeLabels, type Theme } from "@/themes";
import { buildMicrophoneConstraints } from "@/shared/utils/audioConstraints";
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  type NotificationPermissionStatus,
} from '@/services/notifications';

function VoiceAudioSettings() {
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
  const outputRoutingSupported = typeof HTMLMediaElement !== "undefined"
    && typeof (HTMLMediaElement.prototype as HTMLMediaElement & { setSinkId?: unknown }).setSinkId === "function";

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

    if (result.inputDeviceFallback || result.outputDeviceFallback) {
      setAudioFeedback({
        tone: "default",
        message: "A saved audio device is no longer available. The system default is now selected.",
      });
      return;
    }

    if (!result.labelsAvailable) {
      setAudioFeedback({
        tone: "default",
        message: "Device names may stay hidden until you use Test microphone to allow access when supported.",
      });
      return;
    }

    setAudioFeedback(null);
  }, [refreshDevices]);

  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      void refreshDevices().then((result) => {
        if (!disposed) applyDeviceRefreshFeedback(result);
      });
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      disposed = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, [applyDeviceRefreshFeedback, refreshDevices]);

  useEffect(() => stopMicTest, [stopMicTest]);

  const handleMicTestToggle = useCallback(async () => {
    if (isMicTestActive) {
      stopMicTest();
      return;
    }

    try {
      const constraints = buildMicrophoneConstraints({
        selectedInputDeviceId,
        noiseSuppression,
        echoCancellation,
        autoGainControl,
      });
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

      const result = await refreshDevices();
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
      <h3 className="mb-4 text-xl font-semibold tracking-tight">Voice & Audio</h3>
      <div className="space-y-4">
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <h4 className="text-sm font-semibold">Microphone</h4>
            <p className="text-xs text-muted-foreground">Used for new persistent calls and microphone tests.</p>
          </div>
          <select 
            id="settings-audio-input"
            value={selectedInputDeviceId}
            aria-label="Microphone"
            onChange={(e) => setInputDevice(e.target.value)}
            className="vt-select"
          >
            <option value="default">System default microphone</option>
            {availableInputDevices.filter((device) => device.deviceId !== "default").map(device => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || "Microphone"}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Changes apply to the next call.
          </p>
          {isMicTestActive && <div>
            <div className="mb-1 text-xs text-muted-foreground">Input Level: {Math.round((micLevel / 128) * 100)}%</div>
            <div className="h-1 w-full bg-muted">
              <div
                role="progressbar"
                aria-label="Input level"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((micLevel / 128) * 100)}
                className="h-full bg-primary"
                style={{ width: `${(micLevel / 128) * 100}%` }}
              />
            </div>
          </div>}
          <div className="flex flex-wrap gap-2">
            <Button
              size="compact"
              variant="secondary"
              onClick={() => { void handleMicTestToggle(); }}
            >
              {isMicTestActive ? "Stop microphone test" : "Test microphone"}
            </Button>
          </div>
          {audioFeedback && (
            <div
              className={cn(
                "rounded-[12px] border px-3 py-2 text-xs leading-5",
                audioFeedback.tone === "error"
                  ? "border-destructive/35 bg-destructive/10 text-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
              role={audioFeedback.tone === "error" ? "alert" : "status"}
              aria-live={audioFeedback.tone === "error" ? undefined : "polite"}
              data-testid="settings-audio-feedback"
            >
              {audioFeedback.message}
            </div>
          )}
        </div>
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <h4 className="text-sm font-semibold">Speakers</h4>
            <p className="text-xs text-muted-foreground">Used for remote call audio when supported.</p>
          </div>
          <select 
            id="settings-audio-output"
            aria-label="Speakers"
            value={outputRoutingSupported ? selectedOutputDeviceId : "default"}
            onChange={(e) => setOutputDevice(e.target.value)}
            disabled={!outputRoutingSupported}
            className="vt-select"
          >
            <option value="default">System default speakers</option>
            {outputRoutingSupported && availableOutputDevices.filter((device) => device.deviceId !== "default").map(device => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || "Speaker"}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {outputRoutingSupported
              ? "Changes apply to current and future persistent calls."
              : "This environment supports only the system default speakers."}
          </p>
        </div>
        <details>
          <summary className="cursor-pointer text-sm font-medium">Advanced microphone settings</summary>
          <fieldset className="mt-3 space-y-2 rounded-lg border border-border p-4">
            <legend className="sr-only">Microphone processing</legend>
            <p className="text-xs text-muted-foreground">These options apply to the next call.</p>
            <label className="flex items-center justify-between gap-3 text-sm" htmlFor="settings-noise-suppression">
              <span>Noise suppression</span>
              <input id="settings-noise-suppression" type="checkbox" checked={noiseSuppression} onChange={(e) => setNoiseSuppression(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm" htmlFor="settings-echo-cancellation">
              <span>Echo cancellation</span>
              <input id="settings-echo-cancellation" type="checkbox" checked={echoCancellation} onChange={(e) => setEchoCancellation(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm" htmlFor="settings-auto-gain-control">
              <span>Auto gain control</span>
              <input id="settings-auto-gain-control" type="checkbox" checked={autoGainControl} onChange={(e) => setAutoGainControl(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            </label>
          </fieldset>
        </details>
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
    { id: 'audioVideo', label: 'Voice & Audio' },
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
          <div className="mb-5 flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-xl font-semibold tracking-tight">Settings</h2>
            <IconButton label="Close settings" size="compact" onClick={onClose}>
              <X aria-hidden="true" className="h-4 w-4" />
            </IconButton>
          </div>
          <TabList aria-label="Settings sections" className="flex flex-col gap-1">
            {tabs.map((t) => (
              <Tab
                key={t.id}
                value={t.id}
                ref={t.id === 'account' ? accountTabRef : undefined}
                className={cn(
                  "min-h-9 w-full justify-start rounded-[var(--radius-sm)] border border-transparent bg-transparent px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
                  tab === t.id && "bg-accent text-foreground",
                )}
              >{t.label}</Tab>
            ))}
          </TabList>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-7">
          <TabPanel value="account" className="max-w-xl space-y-6">
          {currentUser && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold tracking-tight">Account</h3>
              <div className="flex items-center gap-4 border-b border-border pb-5">
                <Avatar
                  name={currentUser.display_name || currentUser.username}
                  src={currentUser.avatar_url}
                  size="large"
                />
                <div className="flex-1">
                  <div className="font-medium">{currentUser.display_name || currentUser.username}</div>
                  <div className="text-xs text-muted-foreground">@{currentUser.username}</div>
                </div>
                <Button ref={profileTriggerRef} type="button" variant="secondary" onClick={() => setShowEditProfile(true)}>Edit</Button>
              </div>
              <div className="border-t border-border pt-5">
                <Button type="button" variant="danger" onClick={() => setShowLogoutConfirm(true)}>Log Out</Button>
              </div>
            </div>
          )}
          </TabPanel>
          <TabPanel value="appearance" className="max-w-xl space-y-6">
            <h3 className="text-xl font-semibold tracking-tight">Appearance</h3>
            <div role="group" aria-label="Theme" className="flex gap-2">
              {(['light', 'dark'] as Theme[]).map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={theme === t ? "primary" : "secondary"}
                  className="flex-1"
                  onClick={() => setTheme(t)}
                >{themeLabels[t]}</Button>
              ))}
            </div>
          </TabPanel>
          <TabPanel value="notifications" className="max-w-xl space-y-6">
            <h3 className="text-xl font-semibold tracking-tight">Notifications</h3>
            <div className="space-y-3">
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
                <Button type="button" variant="secondary" onClick={() => { void handleNotificationPermissionRequest(); }}>
                  Enable notifications
                </Button>
              )}
            </div>
          </TabPanel>
          <TabPanel value="audioVideo">
            <VoiceAudioSettings />
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
