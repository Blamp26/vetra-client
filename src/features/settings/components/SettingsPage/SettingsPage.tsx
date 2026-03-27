// client/src/features/settings/components/SettingsPage/SettingsPage.tsx
//
// УДАЛЕНО: импорт { themeLabels, type Theme } из "@/themes"
// УДАЛЕНО: селекторы theme и setTheme из useAppStore
// УДАЛЕНО: блок выбора темы в табе "appearance"
// ДОБАВЛЕНО: статический блок "Единая светлая тема"

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
          <label className="text-[0.78rem] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            Input Device
          </label>
          <select 
            value={selectedInputDeviceId}
            onChange={(e) => setInputDevice(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-[0.95rem] outline-none focus:border-primary transition-colors"
          >
            {availableInputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone (${device.deviceId.slice(0, 5)})`}
              </option>
            ))}
            {availableInputDevices.length === 0 && <option value="default">Default</option>}
          </select>
          
          {/* Mic Level Visualizer */}
          <div className="mt-4">
            <div className="flex justify-between text-[0.72rem] text-muted-foreground/70 mb-1.5">
              <span>Input Level</span>
              <span>{Math.round((micLevel / 128) * 100)}%</span>
            </div>
            <div className="h-2 w-full bg-accent rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-75"
                style={{ width: `${Math.min(100, (micLevel / 128) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Output Device */}
        <div className="space-y-2">
          <label className="text-[0.78rem] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            Output Device
          </label>
          <select 
            value={selectedOutputDeviceId}
            onChange={(e) => setOutputDevice(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-[0.95rem] outline-none focus:border-primary transition-colors"
          >
            {availableOutputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Speaker (${device.deviceId.slice(0, 5)})`}
              </option>
            ))}
            {availableOutputDevices.length === 0 && <option value="default">Default</option>}
          </select>
          <p className="text-[0.72rem] text-muted-foreground/70">
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
    <div className="fixed inset-0 z-[200] flex bg-background animate-in fade-in duration-150">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="w-[220px] shrink-0 bg-sidebar border-r border-border flex flex-col p-6 pt-9">
        <div className="mb-5 pl-2">
          <h2 className="text-[1rem] font-bold text-foreground">Настройки</h2>
        </div>

        <nav className="flex flex-col gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-lg border-none text-[0.88rem] cursor-pointer font-inherit transition-all duration-120 text-left",
                tab === t.id ? "bg-accent text-foreground font-semibold" : "bg-transparent text-muted-foreground font-normal hover:bg-accent"
              )}
            >
              <span>{t.icon}</span>
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
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg border-none text-[0.88rem] cursor-pointer font-inherit transition-all duration-120 text-left w-full",
              tab === 'privacy' ? "bg-accent text-foreground font-semibold" : "bg-transparent text-muted-foreground font-normal hover:bg-accent"
            )}
          >
            <span>🔒</span>
            <span>Privacy</span>
          </button>
        </div>

        <div className="mt-2.5 border-t border-border pt-2.5">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border-none bg-transparent text-destructive cursor-pointer font-inherit text-[0.88rem] text-left opacity-85 transition-all duration-120 hover:bg-destructive/10 hover:opacity-100"
          >
            <span>⇥</span>
            <span>Log Out</span>
          </button>
        </div>

        <div className="mt-auto">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg border-none bg-transparent text-muted-foreground/70 cursor-pointer font-inherit text-[0.88rem] transition-colors duration-120 hover:text-foreground"
          >
            ← Назад
          </button>
          <div className="mt-1.5 pl-2 text-[0.72rem] text-muted-foreground/70">
            Esc — закрыть
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-8 px-10 bg-background">
        {/* ── Account ── */}
        {tab === 'account' && currentUser && (
          <div className="max-w-[560px]">
            <h3 className="mb-6 text-[1.1rem] font-bold text-foreground">Аккаунт</h3>

            <div className="bg-card rounded-lg border border-border p-5 mb-4 flex items-center gap-4">
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt="avatar"
                  className="w-16 h-16 rounded-full object-cover shrink-0"
                />
              ) : (
                <span className="w-16 h-16 rounded-full bg-primary text-primary-foreground font-bold text-[1.5rem] inline-flex items-center justify-center shrink-0">
                  {(currentUser.display_name || currentUser.username)[0].toUpperCase()}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[1rem] mb-0.5 text-foreground">
                  {currentUser.display_name || currentUser.username}
                </div>
                <div className="text-muted-foreground/70 text-[0.85rem]">
                  @{currentUser.username}
                </div>
                {currentUser.bio && (
                  <div className="text-muted-foreground text-[0.82rem] mt-1.5">
                    {currentUser.bio}
                  </div>
                )}
              </div>
              <button
                className="px-4 py-2 bg-background border border-border rounded-lg text-muted-foreground text-[0.85rem] font-semibold cursor-pointer hover:bg-accent transition-colors duration-150 shrink-0"
                onClick={() => setShowEditProfile(true)}
              >
                Изменить
              </button>
            </div>

            {[
              { label: 'Юзернейм', value: `@${currentUser.username}` },
              { label: 'Никнейм', value: currentUser.display_name || '—' },
              { label: 'O себе', value: currentUser.bio || '—' },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex justify-between items-center py-3 border-b border-border text-[0.9rem]"
              >
                <span className="text-muted-foreground/70">{label}</span>
                <span className="text-foreground">{value}</span>
              </div>
            ))}

            <div className="flex justify-between items-center py-3 border-b border-border text-[0.9rem]">
              <div>
                <div className="text-muted-foreground/70">Password</div>
                <div className="text-muted-foreground text-[0.82rem] mt-0.5">
                  Last changed recently
                </div>
              </div>
              <button className="px-4 py-2 bg-background border border-border rounded-lg text-muted-foreground text-[0.85rem] font-semibold cursor-pointer hover:bg-accent transition-colors duration-150">
                Change
              </button>
            </div>

            <div className="mt-4.5 pt-4.5 border-t border-border flex items-center justify-between gap-3">
              <div>
                <div className="text-destructive font-bold">Log Out</div>
                <div className="text-[0.82rem] text-muted-foreground/70 mt-0.5">
                  You will be returned to the login screen
                </div>
              </div>
              <button
                className="px-4 py-2 bg-destructive/10 border border-destructive/35 text-destructive rounded-lg text-[0.85rem] font-semibold cursor-pointer hover:bg-destructive/20 transition-colors duration-150"
                onClick={() => setShowLogoutConfirm(true)}
              >
                Log Out
              </button>
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
            <h3 className="mb-6 text-[1.1rem] font-bold text-foreground">Внешний вид</h3>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[0.78rem] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  Тема оформления
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(['light', 'dark'] as Theme[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border transition-all duration-150",
                        theme === t 
                          ? "bg-card border-primary shadow-sm" 
                          : "bg-background border-border hover:border-primary/50"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full border flex items-center justify-center",
                        theme === t ? "border-primary" : "border-border"
                      )}>
                        {theme === t && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <span className={cn(
                        "text-[0.9rem] font-medium",
                        theme === t ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {themeLabels[t]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Палитра цветов — только для информации, не интерактивна */}
              <div className="bg-card rounded-lg border border-border p-4 px-5">
                <div className="font-semibold text-[0.78rem] text-muted-foreground/70 mb-3 uppercase tracking-[0.06em]">
                  Цветовая палитра
                </div>

                <div className="flex flex-col gap-2">
                  {[
                    { label: 'Основной фон', value: 'var(--background)' },
                    { label: 'Сайдбар', value: 'var(--sidebar)' },
                    { label: 'Панель управления', value: 'var(--card)' },
                    { label: 'Текст', value: 'var(--foreground)' },
                    { label: 'Разделители', value: 'var(--border)' },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="flex items-center gap-2.5 text-[0.82rem] text-muted-foreground"
                    >
                      <div
                        style={{ background: value }}
                        className="w-[18px] h-[18px] rounded border border-border shrink-0"
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