import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { IncomingCallModal } from './IncomingCallModal';

// ── CSS Modules mock ──────────────────────────────────────────────────────────
vi.mock('./IncomingCallModal.module.css', () => ({
  default: {
    overlay: 'overlay',
    modal: 'modal',
    avatarRing: 'avatarRing',
    avatar: 'avatar',
    label: 'label',
    callerName: 'callerName',
    actions: 'actions',
    acceptBtn: 'acceptBtn',
    rejectBtn: 'rejectBtn',
    hints: 'hints',
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderModal(
  callerName = 'Alice',
  onAccept = vi.fn(),
  onReject = vi.fn(),
) {
  return render(
    <IncomingCallModal
      callerName={callerName}
      onAccept={onAccept}
      onReject={onReject}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IncomingCallModal', () => {
  let onAccept: Mock<() => void>;
  let onReject: Mock<() => void>;

  beforeEach(() => {
    onAccept = vi.fn();
    onReject = vi.fn();
  });

  // ── Рендер ──────────────────────────────────────────────────────────────────

  it('рендерится без ошибок', () => {
    renderModal('Alice', onAccept, onReject);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('имеет aria-modal="true"', () => {
    renderModal('Alice', onAccept, onReject);
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
  });

  // ── Имя звонящего ────────────────────────────────────────────────────────────

  it('отображает имя звонящего', () => {
    renderModal('Alice', onAccept, onReject);
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('отображает первую букву имени в аватаре (uppercase)', () => {
    renderModal('alice', onAccept, onReject);
    const avatarEl = document.querySelector('.avatar');
    expect(avatarEl?.textContent).toBe('A');
  });

  it('корректно берёт первую букву для имён с пробелом', () => {
    renderModal('Борис Иванов', onAccept, onReject);
    const avatarEl = document.querySelector('.avatar');
    expect(avatarEl?.textContent).toBe('Б');
  });

  it('отображает текст "Входящий звонок"', () => {
    renderModal('Alice', onAccept, onReject);
    expect(screen.getByText('Входящий звонок')).toBeTruthy();
  });

  // ── Кнопки ──────────────────────────────────────────────────────────────────

  it('содержит кнопку "Принять"', () => {
    renderModal('Alice', onAccept, onReject);
    expect(screen.getByRole('button', { name: /Принять/i })).toBeTruthy();
  });

  it('содержит кнопку "Отклонить"', () => {
    renderModal('Alice', onAccept, onReject);
    expect(screen.getByRole('button', { name: /Отклонить/i })).toBeTruthy();
  });

  // ── Колбэки ─────────────────────────────────────────────────────────────────

  it('вызывает onAccept при клике на "Принять"', () => {
    renderModal('Alice', onAccept, onReject);
    fireEvent.click(screen.getByRole('button', { name: /Принять/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('вызывает onReject при клике на "Отклонить"', () => {
    renderModal('Alice', onAccept, onReject);
    fireEvent.click(screen.getByRole('button', { name: /Отклонить/i }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('НЕ вызывает onReject при клике "Принять"', () => {
    renderModal('Alice', onAccept, onReject);
    fireEvent.click(screen.getByRole('button', { name: /Принять/i }));
    expect(onReject).not.toHaveBeenCalled();
  });

  it('НЕ вызывает onAccept при клике "Отклонить"', () => {
    renderModal('Alice', onAccept, onReject);
    fireEvent.click(screen.getByRole('button', { name: /Отклонить/i }));
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('повторные клики на "Принять" вызывают onAccept соответствующее число раз', () => {
    renderModal('Alice', onAccept, onReject);
    const btn = screen.getByRole('button', { name: /Принять/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onAccept).toHaveBeenCalledTimes(2);
  });

  // ── Граничные случаи ─────────────────────────────────────────────────────────

  it('отображает длинное имя без краша', () => {
    const longName = 'Очень Длинное Имя Пользователя Которое Не Влезает';
    renderModal(longName, onAccept, onReject);
    expect(screen.getByText(longName)).toBeTruthy();
  });

  it('корректно рендерится с именем из одного символа', () => {
    renderModal('X', onAccept, onReject);
    // 'X' отображается дважды: в аватаре и в имени звонящего
    const elements = screen.getAllByText('X');
    expect(elements.length).toBe(2);
    
    const avatarEl = document.querySelector('.avatar');
    expect(avatarEl?.textContent).toBe('X');
  });
});
