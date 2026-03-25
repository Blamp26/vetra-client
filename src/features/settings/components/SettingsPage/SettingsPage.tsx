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
    <div className="fixed inset-0 z-[200] flex bg-[#FAFAFA] animate-in fade-in duration-150">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="w-[220px] shrink-0 bg-[#F8F8F8] border-r border-[#E1E1E1] flex flex-col p-6 pt-9">
        <div className="mb-5 pl-2">
          <h2 className="text-[1rem] font-bold">Настройки</h2>
        </div>

        <nav className="flex flex-col gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-lg border-none text-[0.88rem] cursor-pointer font-inherit transition-all duration-120 text-left",
                tab === t.id ? "bg-[#EDEDED] text-[#0A0A0A] font-semibold" : "bg-transparent text-[#4A4A4A] font-normal hover:bg-[#EDEDED]"
              )}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-2 border-t border-[#E1E1E1] pt-2">
          <div className="text-[11px] text-[#7A7A7A] px-4 py-1 tracking-[0.04em] uppercase font-semibold opacity-60">
            App Settings
          </div>
          <button
            onClick={() => setTab('privacy')}
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg border-none text-[0.88rem] cursor-pointer font-inherit transition-all duration-120 text-left w-full",
              tab === 'privacy' ? "bg-[#EDEDED] text-[#0A0A0A] font-semibold" : "bg-transparent text-[#4A4A4A] font-normal hover:bg-[#EDEDED]"
            )}
          >
            <span>🔒</span>
            <span>Privacy</span>
          </button>
        </div>

        <div className="mt-2.5 border-t border-[#E1E1E1] pt-2.5">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border-none bg-transparent text-[#E74C3C] cursor-pointer font-inherit text-[0.88rem] text-left opacity-85 transition-all duration-120 hover:bg-[#E74C3C]/12 hover:opacity-100"
          >
            <span>⇥</span>
            <span>Log Out</span>
          </button>
        </div>

        <div className="mt-auto">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg border-none bg-transparent text-[#7A7A7A] cursor-pointer font-inherit text-[0.88rem] transition-colors duration-120 hover:text-[#0A0A0A]"
          >
            ← Назад
          </button>
          <div className="mt-1.5 pl-2 text-[0.72rem] text-[#7A7A7A]">
            Esc — закрыть
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-8 px-10 bg-[#FAFAFA]">
        {/* ── Account ── */}
        {tab === 'account' && currentUser && (
          <div className="max-w-[560px]">
            <h3 className="mb-6 text-[1.1rem] font-bold">Аккаунт</h3>

            <div className="bg-[#F8F8F8] rounded-lg border border-[#E1E1E1] p-5 mb-4 flex items-center gap-4">
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt="avatar"
                  className="w-16 h-16 rounded-full object-cover shrink-0"
                />
              ) : (
                <span className="w-16 h-16 rounded-full bg-[#5865F2] text-white font-bold text-[1.5rem] inline-flex items-center justify-center shrink-0">
                  {(currentUser.display_name || currentUser.username)[0].toUpperCase()}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[1rem] mb-0.5">
                  {currentUser.display_name || currentUser.username}
                </div>
                <div className="text-[#7A7A7A] text-[0.85rem]">
                  @{currentUser.username}
                </div>
                {currentUser.bio && (
                  <div className="text-[#4A4A4A] text-[0.82rem] mt-1.5">
                    {currentUser.bio}
                  </div>
                )}
              </div>
              <button
                className="px-4 py-2 bg-white border border-[#E1E1E1] rounded-lg text-[#4A4A4A] text-[0.85rem] font-semibold cursor-pointer hover:bg-[#F8F8F8] transition-colors duration-150 shrink-0"
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
                className="flex justify-between items-center py-3 border-b border-[#E1E1E1] text-[0.9rem]"
              >
                <span className="text-[#7A7A7A]">{label}</span>
                <span className="text-[#0A0A0A]">{value}</span>
              </div>
            ))}

            <div className="flex justify-between items-center py-3 border-b border-[#E1E1E1] text-[0.9rem]">
              <div>
                <div className="text-[#7A7A7A]">Password</div>
                <div className="text-[#4A4A4A] text-[0.82rem] mt-0.5">
                  Last changed recently
                </div>
              </div>
              <button className="px-4 py-2 bg-white border border-[#E1E1E1] rounded-lg text-[#4A4A4A] text-[0.85rem] font-semibold cursor-pointer hover:bg-[#F8F8F8] transition-colors duration-150">
                Change
              </button>
            </div>

            <div className="mt-4.5 pt-4.5 border-t border-[#E1E1E1] flex items-center justify-between gap-3">
              <div>
                <div className="text-[#E74C3C] font-bold">Log Out</div>
                <div className="text-[0.82rem] text-[#7A7A7A] mt-0.5">
                  You will be returned to the login screen
                </div>
              </div>
              <button
                className="px-4 py-2 bg-[#E74C3C]/12 border border-[#E74C3C]/35 text-[#E74C3C] rounded-lg text-[0.85rem] font-semibold cursor-pointer hover:bg-[#E74C3C]/20 transition-colors duration-150"
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
            <h3 className="mb-6 text-[1.1rem] font-bold">Уведомления</h3>
            <div className="bg-[#F8F8F8] rounded-lg border border-[#E1E1E1] p-5 text-[#7A7A7A] text-[0.9rem] text-center">
              🔔 Настройки уведомлений — в разработке
            </div>
          </div>
        )}

        {/* ── Profile ── */}
        {tab === 'profile' && (
          <div className="max-w-[560px]">
            <h3 className="mb-6 text-[1.1rem] font-bold">Profile</h3>
            <div className="bg-[#F8F8F8] rounded-lg border border-[#E1E1E1] p-5 text-[#7A7A7A] text-[0.9rem] text-center">
              🪪 Profile settings — work in progress
            </div>
          </div>
        )}

        {/* ── Appearance — статический блок, переключение тем удалено ── */}
        {tab === 'appearance' && (
          <div className="max-w-[560px]">
            <h3 className="mb-6 text-[1.1rem] font-bold">Внешний вид</h3>

            {/* Уведомление о единой теме */}
            <div className="bg-[#F8F8F8] rounded-lg border border-[#E1E1E1] p-5 px-6 mb-4 flex items-start gap-3.5">
              {/* Иконка солнца — inline SVG, без внешних зависимостей */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#5865F2"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 mt-0.5"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>

              <div>
                <div className="font-semibold text-[0.9rem] text-[#0A0A0A] mb-1">
                  Единая светлая тема
                </div>
                <div className="text-[0.83rem] text-[#4A4A4A] leading-[1.5]">
                  Приложение использует единую светлую тему.
                  Переключение тем недоступно в этой версии.
                </div>
              </div>
            </div>

            {/* Палитра цветов — только для информации, не интерактивна */}
            <div className="bg-[#F8F8F8] rounded-lg border border-[#E1E1E1] p-4 px-5">
              <div className="font-semibold text-[0.78rem] text-[#7A7A7A] mb-3 uppercase tracking-[0.06em]">
                Цветовая палитра
              </div>

              <div className="flex flex-col gap-2">
                {[
                  { label: 'Основной фон', value: '#FAFAFA' },
                  { label: 'Сайдбар', value: '#F8F8F8' },
                  { label: 'Панель управления', value: '#FFFFFF' },
                  { label: 'Текст', value: '#0A0A0A' },
                  { label: 'Разделители', value: '#E1E1E1' },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2.5 text-[0.82rem] text-[#4A4A4A]"
                  >
                    <div
                      style={{ background: value }}
                      className="w-[18px] h-[18px] rounded border border-[#E1E1E1] shrink-0"
                    />
                    <span className="flex-1">{label}</span>
                    <code className="font-mono text-[0.78rem] text-[#7A7A7A]">
                      {value}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Audio & Video ── */}
        {tab === 'audioVideo' && (
          <div className="max-w-[560px]">
            <h3 className="mb-6 text-[1.1rem] font-bold">Audio &amp; Video</h3>
            <div className="bg-[#F8F8F8] rounded-lg border border-[#E1E1E1] p-5 text-[#7A7A7A] text-[0.9rem] text-center">
              🎙️ Audio and video settings — work in progress
            </div>
          </div>
        )}

        {/* ── Privacy ── */}
        {tab === 'privacy' && (
          <div className="max-w-[560px]">
            <h3 className="mb-6 text-[1.1rem] font-bold">Privacy</h3>
            <div className="bg-[#F8F8F8] rounded-lg border border-[#E1E1E1] p-5 text-[#7A7A7A] text-[0.9rem] text-center">
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