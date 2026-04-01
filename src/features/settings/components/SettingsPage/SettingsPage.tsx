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

  // Микрофонный визуализатор
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
    <div className="max-w-[560px]">
      <h3 className="mb-6 text-[1.1rem] font-bold">Audio & Video</h3>
      
      <div className="space-y-6">
        {/* Input Device */}
        <div className="space-y-2">
          <label className="text-[0.78rem] font-bold uppercase tracking-[0.06em] text-muted-foreground" htmlFor="settings-audio-input">
            Input Device
          </label>
          <select 
            id="settings-audio-input"
            name="audio-input"
            value={selectedInputDeviceId}
            onChange={(e) => setInputDevice(e.target.value)}
            className="w-full px-4 py-3 bg-background/50 border border-transparent rounded-[1rem] text-foreground text-[0.95rem] outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:bg-background/80 ring-1 ring-inset ring-border/30 dark:ring-white/5 focus:ring-primary/50 cursor-pointer shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] hover:ring-border/50 font-medium"
          >
            {availableInputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId} className="bg-card">
                {device.label || `Microphone (${device.deviceId.slice(0, 5)})`}
              </option>
            ))}
            {availableInputDevices.length === 0 && <option value="default" className="bg-card">Default</option>}
          </select>
          
          {/* Mic Level Visualizer */}
          <div className="mt-5">
            <div className="flex justify-between text-[0.6875rem] text-muted-foreground/70 mb-2 font-bold uppercase tracking-widest pl-1">
              <span>Input Level</span>
              <span>{Math.round((micLevel / 128) * 100)}%</span>
            </div>
            <div className="h-2.5 w-full bg-muted/40 rounded-full overflow-hidden ring-1 ring-inset ring-black/5 dark:ring-white/5 shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-75 min-w-[4px] shadow-[0_0_12px_-2px_var(--tw-shadow-color)] shadow-primary/40 rounded-full"
                style={{ width: `${Math.max(2, Math.min(100, (micLevel / 128) * 100))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Output Device */}
        <div className="space-y-2">
          <label className="text-[0.78rem] font-bold uppercase tracking-[0.06em] text-muted-foreground" htmlFor="settings-audio-output">
            Output Device
          </label>
          <select 
            id="settings-audio-output"
            name="audio-output"
            value={selectedOutputDeviceId}
            onChange={(e) => setOutputDevice(e.target.value)}
            className="w-full px-4 py-3 bg-background/50 border border-transparent rounded-[1rem] text-foreground text-[0.95rem] outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:bg-background/80 ring-1 ring-inset ring-border/30 dark:ring-white/5 focus:ring-primary/50 cursor-pointer shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] hover:ring-border/50 font-medium"
          >
            {availableOutputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId} className="bg-card">
                {device.label || `Speaker (${device.deviceId.slice(0, 5)})`}
              </option>
            ))}
            {availableOutputDevices.length === 0 && <option value="default" className="bg-card">Default</option>}
          </select>
          <p className="text-[0.72rem] text-muted-foreground/70 pl-2 mt-1.5">
            Note: Speaker selection depends on browser support (mostly Chrome/Edge).
          </p>
        </div>

        <button 
          onClick={() => refreshDevices()}
          className="text-[0.85rem] text-primary hover:underline font-medium"
        >
          ↻ Refresh devices
        </button>
      </div>
    </div>
  );
}

type SettingsTab =
  | 'account'
  | 'profile'
  | 'appearance'
  | 'notifications'
  | 'audioVideo'
  | 'privacy';

interface Props {
  onClose: () => void;
}

export function SettingsPage({ onClose }: Props) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const logout = useAppStore((s: RootState) => s.logout);
  const theme = useAppStore((s: RootState) => s.theme);
  const setTheme = useAppStore((s: RootState) => s.setTheme);

  const [tab, setTab] = useState<SettingsTab>('account');
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Закрытие по Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'account', label: 'Account', icon: '👤' },
    { id: 'profile', label: 'Profile', icon: '🪪' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'audioVideo', label: 'Audio & Video', icon: '🎙️' },
  ];

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-background/50 backdrop-blur-3xl animate-in fade-in duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] p-4 sm:p-8">
      {/* Clicking outside closes the modal */}
      <div className="absolute inset-0 z-0" onClick={onClose} />
      
      <div className="relative z-10 flex w-full max-w-[1050px] h-[75vh] min-h-[550px] max-h-[850px] bg-card/80 backdrop-blur-xl border border-white/10 dark:border-white/5 rounded-[2rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden ring-1 ring-inset ring-white/10 transition-all duration-500 animate-in zoom-in-[0.98] ease-[cubic-bezier(0.32,0.72,0,1)]">
        
        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <div className="w-[240px] shrink-0 bg-muted/20 border-r border-border/40 flex flex-col p-6 pt-9 backdrop-blur-md">
          <div className="mb-6 pl-3">
            <h2 className="text-[1.1rem] font-extrabold text-foreground tracking-tight"> Settings</h2>
          </div>

        <nav className="flex flex-col gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-[1rem] border-none text-[0.88rem] cursor-pointer font-inherit transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-left group",
                tab === t.id 
                  ? "bg-primary text-primary-foreground font-semibold shadow-[0_4px_12px_-4px_var(--tw-shadow-color)] shadow-primary/40 ring-1 ring-inset ring-black/10 dark:ring-white/10" 
                  : "bg-transparent text-muted-foreground font-medium hover:bg-muted/50 hover:text-foreground active:scale-95"
              )}
            >
              <span className={cn("transition-transform duration-300", tab === t.id ? "scale-110" : "group-hover:scale-110")}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-2 border-t border-border pt-2">
          <div className="text-[11px] text-muted-foreground/70 px-4 py-1 tracking-[0.04em] uppercase font-semibold opacity-60">
            App Settings
          </div>
          <button
            onClick={() => setTab('privacy')}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-[1rem] border-none text-[0.88rem] cursor-pointer font-inherit transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-left w-full group",
              tab === 'privacy' 
                ? "bg-primary text-primary-foreground font-semibold shadow-[0_4px_12px_-4px_var(--tw-shadow-color)] shadow-primary/40 ring-1 ring-inset ring-black/10 dark:ring-white/10" 
                : "bg-transparent text-muted-foreground font-medium hover:bg-muted/50 hover:text-foreground active:scale-95"
            )}
          >
            <span className={cn("transition-transform duration-300", tab === 'privacy' ? "scale-110" : "group-hover:scale-110")}>🔒</span>
            <span>Privacy</span>
          </button>
        </div>

        <div className="mt-2.5 border-t border-border/40 pt-2.5">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-[1rem] border-none bg-transparent text-destructive cursor-pointer font-inherit text-[0.88rem] font-medium text-left opacity-85 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-destructive/10 hover:opacity-100 active:scale-95 group"
          >
            <span className="group-hover:-translate-x-1 transition-transform duration-300">⇥</span>
            <span>Log Out</span>
          </button>
        </div>

        <div className="mt-auto">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg border-none bg-transparent text-muted-foreground/70 cursor-pointer font-inherit text-[0.88rem] transition-colors duration-120 hover:text-foreground"
          >
            ← Back
          </button>
          <div className="mt-1.5 pl-2 text-[0.72rem] text-muted-foreground/70">
            Esc — close
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-10 px-12 bg-transparent custom-scrollbar">
        {/* ── Account ── */}
        {tab === 'account' && currentUser && (
          <div className="max-w-[560px]">
            <h3 className="mb-6 text-[1.2rem] font-bold text-foreground tracking-tight">Account</h3>

            <div className="bg-background/40 backdrop-blur-md rounded-[1.5rem] border border-border/40 p-6 mb-6 flex items-center gap-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-border/30 dark:ring-white/5">
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt="avatar"
                  className="w-16 h-16 rounded-full object-cover shrink-0 ring-2 ring-background shadow-md"
                />
              ) : (
                <span className="w-16 h-16 rounded-full bg-primary text-primary-foreground font-bold text-[1.5rem] inline-flex items-center justify-center shrink-0 ring-2 ring-background shadow-md">
                  {(currentUser.display_name || currentUser.username)[0].toUpperCase()}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[1.1rem] mb-0.5 text-foreground">
                  {currentUser.display_name || currentUser.username}
                </div>
                <div className="text-muted-foreground/70 text-[0.85rem] font-medium">
                  @{currentUser.username}
                </div>
                {currentUser.bio && (
                  <div className="text-muted-foreground text-[0.82rem] mt-1.5">
                    {currentUser.bio}
                  </div>
                )}
              </div>
              <button
                className="px-5 py-2.5 bg-background border border-border/50 rounded-[1rem] text-foreground text-[0.85rem] font-semibold cursor-pointer hover:bg-muted/50 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] shrink-0 active:scale-95 shadow-sm ring-1 ring-inset ring-transparent hover:ring-border/50"
                onClick={() => setShowEditProfile(true)}
              >
                Edit Profile
              </button>
            </div>

            <div className="bg-background/40 backdrop-blur-md rounded-[1.5rem] border border-border/40 p-2 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-border/30 dark:ring-white/5">
              {[
                { label: 'Username', value: `@${currentUser.username}` },
                { label: 'Display Name', value: currentUser.display_name || '—' },
                { label: 'Bio', value: currentUser.bio || '—' },
              ].map(({ label, value }, i, arr) => (
                <div
                  key={label}
                  className={cn(
                    "flex justify-between items-center px-4 py-3.5 text-[0.9rem]",
                    i !== arr.length - 1 && "border-b border-border/40"
                  )}
                >
                  <span className="text-muted-foreground font-medium">{label}</span>
                  <span className="text-foreground font-medium">{value}</span>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <h4 className="text-[0.75rem] uppercase tracking-widest font-bold text-muted-foreground/60 mb-3 pl-2">Security</h4>
              <div className="bg-background/40 backdrop-blur-md rounded-[1.5rem] border border-border/40 p-2 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-border/30 dark:ring-white/5">
                <div className="flex justify-between items-center px-4 py-3.5 text-[0.9rem]">
                  <div>
                    <div className="text-foreground font-medium">Password</div>
                    <div className="text-muted-foreground text-[0.82rem] mt-0.5">
                      Last changed recently
                    </div>
                  </div>
                  <button className="px-5 py-2.5 bg-background border border-border/50 rounded-[1rem] text-foreground text-[0.85rem] font-semibold cursor-pointer hover:bg-muted/50 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95 shadow-sm">
                    Change
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <h4 className="text-[0.75rem] uppercase tracking-widest font-bold text-destructive/60 mb-3 pl-2">Danger Zone</h4>
              <div className="bg-background/40 backdrop-blur-md rounded-[1.5rem] border border-destructive/20 p-2 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-destructive/10">
                <div className="flex justify-between items-center px-4 py-3.5">
                  <div>
                    <div className="text-destructive font-bold">Log Out</div>
                    <div className="text-[0.82rem] text-muted-foreground/70 mt-0.5">
                      You will be returned to the login screen
                    </div>
                  </div>
                  <button
                    className="px-5 py-2.5 bg-destructive/10 border border-destructive/30 text-destructive rounded-[1rem] text-[0.85rem] font-bold cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95 shadow-sm"
                    onClick={() => setShowLogoutConfirm(true)}
                  >
                    Log Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Notifications ── */}
        {tab === 'notifications' && (
          <div className="max-w-[560px]">
            <h3 className="mb-6 text-[1.1rem] font-bold text-foreground">Уведомления</h3>
            <div className="bg-card rounded-lg border border-border p-5 text-muted-foreground/70 text-[0.9rem] text-center">
              🔔 Настройки уведомлений — в разработке
            </div>
          </div>
        )}

        {/* ── Profile ── */}
        {tab === 'profile' && (
          <div className="max-w-[560px]">
            <h3 className="mb-6 text-[1.1rem] font-bold text-foreground">Profile</h3>
            <div className="bg-card rounded-lg border border-border p-5 text-muted-foreground/70 text-[0.9rem] text-center">
              🪪 Profile settings — work in progress
            </div>
          </div>
        )}

        {/* ── Appearance ── */}
        {tab === 'appearance' && (
          <div className="max-w-[560px]">
            <h3 className="mb-6 text-[1.2rem] font-bold text-foreground tracking-tight">Appearance</h3>

            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-[0.75rem] font-bold uppercase tracking-widest text-muted-foreground pl-2">
                  Theme Preference
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {(['light', 'dark'] as Theme[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={cn(
                        "flex items-center gap-3 p-4 rounded-[1.25rem] border transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]",
                        theme === t 
                          ? "bg-card border-primary shadow-[0_4px_12px_-4px_var(--tw-shadow-color)] shadow-primary/30 ring-1 ring-inset ring-primary/20" 
                          : "bg-background/50 border-border/50 hover:border-border hover:bg-card/80 shadow-sm ring-1 ring-inset ring-transparent"
                      )}
                    >
                      <div className={cn(
                        "w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center transition-colors duration-300",
                        theme === t ? "border-primary" : "border-border/80"
                      )}>
                        {theme === t && <div className="w-2.5 h-2.5 rounded-full bg-primary animate-in zoom-in-50 duration-200" />}
                      </div>
                      <span className={cn(
                        "text-[0.95rem] font-semibold transition-colors duration-300",
                        theme === t ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {themeLabels[t]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme Preview Colors */}
              <div className="bg-background/40 backdrop-blur-md rounded-[1.5rem] border border-border/40 p-5 px-6 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-border/30 dark:ring-white/5">
                <div className="font-bold text-[0.78rem] text-muted-foreground/70 mb-4 uppercase tracking-widest pl-1">
                  Active Palette Target
                </div>

                <div className="flex flex-col gap-3">
                  {[
                    { label: 'Background Layer', value: 'var(--background)' },
                    { label: 'Sidebar Layer', value: 'var(--sidebar)' },
                    { label: 'Card Surface', value: 'var(--card)' },
                    { label: 'Primary Text', value: 'var(--foreground)' },
                    { label: 'Borders & Rules', value: 'var(--border)' },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="flex items-center gap-3.5 text-[0.9rem] font-medium text-muted-foreground"
                    >
                      <div
                        style={{ background: value }}
                        className="w-6 h-6 rounded-full border border-border/50 shadow-sm shrink-0 ring-1 ring-inset ring-black/10 dark:ring-white/10"
                      />
                      <span className="flex-1">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Audio & Video ── */}
        {tab === 'audioVideo' && (
          <AudioVideoSettings />
        )}

        {/* ── Privacy ── */}
        {tab === 'privacy' && (
          <div className="max-w-[560px]">
            <h3 className="mb-6 text-[1.1rem] font-bold text-foreground">Privacy</h3>
            <div className="bg-card rounded-lg border border-border p-5 text-muted-foreground/70 text-[0.9rem] text-center">
              🔒 Privacy settings — work in progress
            </div>
          </div>
        )}
      </div>

      </div>
      
      {showEditProfile && currentUser && (
        <ProfileModal
          user={currentUser}
          onClose={() => setShowEditProfile(false)}
        />
      )}

      {showLogoutConfirm && (
        <ConfirmModal
          title="Log out of Vetra?"
          message="You will need to log back in to access your messages."
          confirmLabel="Log Out"
          cancelLabel="Cancel"
          isDanger
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={() => {
            setShowLogoutConfirm(false);
            logout();
            onClose();
          }}
        />
      )}
    </div>
  );
}