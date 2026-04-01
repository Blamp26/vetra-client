// client/src/features/settings/components/SettingsPage/SettingsPage.tsx

import { useState, useEffect } from 'react';
import { useAppStore, type RootState } from '@/store';
import { ProfileModal } from '@/features/profile/components/ProfileModal/ProfileModal';
import { ConfirmModal } from '@/shared/components/ConfirmModal/ConfirmModal';
import { cn } from '@/shared/utils/cn';
import { themeLabels, type Theme } from "@/themes";

function AudioVideoSettings() {
  const { 
    availableInputDevices, 
    availableOutputDevices, 
    selectedInputDeviceId, 
    selectedOutputDeviceId,
    setInputDevice,
    setOutputDevice,
    refreshDevices 
  } = useAppStore((s: RootState) => ({
    availableInputDevices: s.availableInputDevices,
    availableOutputDevices: s.availableOutputDevices,
    selectedInputDeviceId: s.selectedInputDeviceId,
    selectedOutputDeviceId: s.selectedOutputDeviceId,
    setInputDevice: s.setInputDevice,
    setOutputDevice: s.setOutputDevice,
    refreshDevices: s.refreshDevices
  }));

  const [micLevel, setMicLevel] = useState(0);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    let audioContext: AudioContext;
    let analyser: AnalyserNode;
    let microphone: MediaStreamAudioSourceNode;
    let animationId: number;
    let stream: MediaStream;

    const startVisualizer = async () => {
      try {
        const constraints = {
          audio: { deviceId: selectedInputDeviceId !== 'default' ? { exact: selectedInputDeviceId } : undefined }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        analyser.fftSize = 256;
        microphone.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((a, b) => a + b, 0);
          const average = sum / dataArray.length;
          setMicLevel(average);
          animationId = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      } catch (err) {
        console.error("Visualizer error:", err);
      }
    };
    startVisualizer();
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (audioContext) audioContext.close();
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [selectedInputDeviceId]);

  return (
    <div className="max-w-xl">
      <h3 className="mb-4 text-lg font-normal">Audio & Video</h3>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="settings-audio-input">Input Device</label>
          <select 
            id="settings-audio-input"
            value={selectedInputDeviceId}
            onChange={(e) => setInputDevice(e.target.value)}
            className="w-full p-2 border border-border bg-background"
          >
            {availableInputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || `Mic (${device.deviceId.slice(0, 5)})`}</option>
            ))}
          </select>
          <div className="mt-2">
            <div className="text-[10px] text-muted-foreground mb-1">Input Level: {Math.round((micLevel / 128) * 100)}%</div>
            <div className="h-1 w-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${(micLevel / 128) * 100}%` }} />
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="settings-audio-output">Output Device</label>
          <select 
            id="settings-audio-output"
            value={selectedOutputDeviceId}
            onChange={(e) => setOutputDevice(e.target.value)}
            className="w-full p-2 border border-border bg-background"
          >
            {availableOutputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || `Speaker (${device.deviceId.slice(0, 5)})`}</option>
            ))}
          </select>
        </div>
        <button onClick={() => refreshDevices()} className="text-sm border border-border px-2 py-1">Refresh devices</button>
      </div>
    </div>
  );
}

type SettingsTab = 'account' | 'profile' | 'appearance' | 'notifications' | 'audioVideo' | 'privacy';

interface Props { onClose: () => void; }

export function SettingsPage({ onClose }: Props) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const logout = useAppStore((s: RootState) => s.logout);
  const theme = useAppStore((s: RootState) => s.theme);
  const setTheme = useAppStore((s: RootState) => s.setTheme);
  const [tab, setTab] = useState<SettingsTab>('account');
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'account', label: 'Account' },
    { id: 'profile', label: 'Profile' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'audioVideo', label: 'Audio & Video' },
  ];

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-background/50 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-5xl h-[80vh] bg-card border border-border">
        <div className="w-64 border-r border-border bg-muted/20 flex flex-col p-4">
          <h2 className="text-lg font-normal mb-4">Settings</h2>
          <nav className="flex flex-col gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn("px-2 py-1 text-left text-sm border", tab === t.id ? "bg-primary text-primary-foreground border-primary" : "border-transparent")}
              >{t.label}</button>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-2">
            <button onClick={() => setShowLogoutConfirm(true)} className="text-destructive text-sm text-left px-2">Log Out</button>
            <button onClick={onClose} className="text-sm text-left px-2">Back</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          {tab === 'account' && currentUser && (
            <div className="max-w-xl space-y-4">
              <h3 className="text-lg font-normal">Account</h3>
              <div className="flex items-center gap-4 border border-border p-4">
                <div className="w-12 h-12 bg-primary text-primary-foreground flex items-center justify-center">
                  {(currentUser.display_name || currentUser.username)[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-normal">{currentUser.display_name || currentUser.username}</div>
                  <div className="text-xs text-muted-foreground">@{currentUser.username}</div>
                </div>
                <button onClick={() => setShowEditProfile(true)} className="border border-border px-3 py-1 text-sm">Edit</button>
              </div>
              <div className="border border-border">
                <div className="p-2 border-b border-border flex justify-between text-sm">
                  <span className="text-muted-foreground">Username</span>
                  <span>@{currentUser.username}</span>
                </div>
                <div className="p-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">Display Name</span>
                  <span>{currentUser.display_name || '—'}</span>
                </div>
              </div>
            </div>
          )}
          {tab === 'appearance' && (
            <div className="max-w-xl space-y-4">
              <h3 className="text-lg font-normal">Appearance</h3>
              <div className="flex gap-2">
                {(['light', 'dark'] as Theme[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={cn("flex-1 p-2 border text-sm", theme === t ? "bg-primary text-primary-foreground border-primary" : "border-border")}
                  >{themeLabels[t]}</button>
                ))}
              </div>
            </div>
          )}
          {tab === 'audioVideo' && <AudioVideoSettings />}
        </div>
      </div>
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
    </div>
  );
}
