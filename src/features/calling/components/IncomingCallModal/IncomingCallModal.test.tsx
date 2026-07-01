import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { IncomingCallModal } from './IncomingCallModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderModal(
  callerName = 'Alice',
  isPending = false,
  onAccept = vi.fn(),
  onReject = vi.fn(),
) {
  return render(
    <IncomingCallModal
      callerName={callerName}
      isPending={isPending}
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
    renderModal('Alice', false, onAccept, onReject);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('имеет aria-modal="true"', () => {
    renderModal('Alice', false, onAccept, onReject);
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
  });

  // ── Имя звонящего ────────────────────────────────────────────────────────────

  it('отображает имя звонящего', () => {
    renderModal('Alice', false, onAccept, onReject);
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('отображает первую букву имени в аватаре (uppercase)', () => {
    renderModal('alice', false, onAccept, onReject);
    // После перехода на Tailwind и удаления CSS-модулей, 
    // мы ищем элемент по тексту или по структуре, так как класс .avatar больше не используется в тестах.
    const avatarEl = screen.getByText('A');
    expect(avatarEl).toBeTruthy();
  });

  it('корректно берёт первую букву для имён с пробелом', () => {
    renderModal('Борис Иванов', false, onAccept, onReject);
    const avatarEl = screen.getByText('Б');
    expect(avatarEl).toBeTruthy();
  });

  it('отображает текст "Incoming call"', () => {
    renderModal('Alice', false, onAccept, onReject);
    expect(screen.getByText('Incoming call')).toBeTruthy();
  });

  // ── Кнопки ──────────────────────────────────────────────────────────────────

  it('содержит кнопку "Accept"', () => {
    renderModal('Alice', false, onAccept, onReject);
    expect(screen.getByRole('button', { name: /Accept/i })).toBeTruthy();
  });

  it('содержит кнопку "Decline"', () => {
    renderModal('Alice', false, onAccept, onReject);
    expect(screen.getByRole('button', { name: /Decline/i })).toBeTruthy();
  });

  // ── Колбэки ─────────────────────────────────────────────────────────────────

  it('вызывает onAccept при клике на "Accept"', () => {
    renderModal('Alice', false, onAccept, onReject);
    fireEvent.click(screen.getByRole('button', { name: /Accept/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('вызывает onReject при клике на "Decline"', () => {
    renderModal('Alice', false, onAccept, onReject);
    fireEvent.click(screen.getByRole('button', { name: /Decline/i }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('НЕ вызывает onReject при клике "Accept"', () => {
    renderModal('Alice', false, onAccept, onReject);
    fireEvent.click(screen.getByRole('button', { name: /Accept/i }));
    expect(onReject).not.toHaveBeenCalled();
  });

  it('НЕ вызывает onAccept при клике "Decline"', () => {
    renderModal('Alice', false, onAccept, onReject);
    fireEvent.click(screen.getByRole('button', { name: /Decline/i }));
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('disables both actions while the incoming call is being accepted', () => {
    renderModal('Alice', true, onAccept, onReject);

    const accept = screen.getByRole('button', { name: /Connecting.../i });
    const decline = screen.getByRole('button', { name: /Decline/i });

    expect(accept).toBeDisabled();
    expect(decline).toBeDisabled();

    fireEvent.click(accept);
    fireEvent.click(decline);

    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it('повторные клики на "Accept" вызывают onAccept соответствующее число раз when pending is false', () => {
    renderModal('Alice', false, onAccept, onReject);
    const btn = screen.getByRole('button', { name: /Accept/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onAccept).toHaveBeenCalledTimes(2);
  });

  // ── Граничные случаи ─────────────────────────────────────────────────────────

  it('отображает длинное имя без краша', () => {
    const longName = 'Очень Длинное Имя Пользователя Которое Не Влезает';
    renderModal(longName, false, onAccept, onReject);
    expect(screen.getByText(longName)).toBeTruthy();
  });

  it('корректно рендерится с именем из одного символа', () => {
    renderModal('X', false, onAccept, onReject);
    expect(screen.getAllByText('X')).toHaveLength(2);
  });
});
