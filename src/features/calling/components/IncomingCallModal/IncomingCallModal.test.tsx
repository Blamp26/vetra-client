import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { StrictMode } from 'react';
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

  it('exposes the caller as the dialog name and connects its description', () => {
    renderModal('Alice', false, onAccept, onReject);
    const dialog = screen.getByRole('dialog', { name: 'Alice' });

    expect(dialog).toHaveAccessibleDescription('Choose whether to answer or decline.');
  });

  it('starts focus on Decline instead of Accept', () => {
    renderModal('Alice', false, onAccept, onReject);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Decline call' }));
  });

  it('does not accept or decline from Escape or a backdrop click', () => {
    renderModal('Alice', false, onAccept, onReject);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    expect(document.querySelector('.vt-dialog-backdrop')).not.toBeInTheDocument();
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

    const accept = screen.getByRole('button', { name: 'Accept call' });
    const decline = screen.getByRole('button', { name: 'Decline call' });

    expect(accept).toBeDisabled();
    expect(decline).toBeDisabled();

    fireEvent.click(accept);
    fireEvent.click(decline);

    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it('fires accept only once even if the button is clicked repeatedly', () => {
    renderModal('Alice', false, onAccept, onReject);
    const btn = screen.getByRole('button', { name: /Accept/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).not.toHaveBeenCalled();
  });

  it('fires decline only once even if the button is clicked repeatedly', () => {
    renderModal('Alice', false, onAccept, onReject);
    const btn = screen.getByRole('button', { name: /Decline/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('fires the optional presentation callback after commit only once per presentation key', () => {
    const onPresented = vi.fn();
    const { rerender } = render(
      <IncomingCallModal
        callerName="Alice"
        onAccept={onAccept}
        onReject={onReject}
        presentationKey="call-1"
        onPresented={onPresented}
      />,
    );

    expect(onPresented).toHaveBeenCalledTimes(1);
    rerender(
      <IncomingCallModal
        callerName="Alice"
        onAccept={onAccept}
        onReject={onReject}
        presentationKey="call-1"
        onPresented={onPresented}
      />,
    );
    expect(onPresented).toHaveBeenCalledTimes(1);

    rerender(
      <IncomingCallModal
        callerName="Alice"
        onAccept={onAccept}
        onReject={onReject}
        presentationKey="call-2"
        onPresented={onPresented}
      />,
    );
    expect(onPresented).toHaveBeenCalledTimes(2);
  });

  it('does not duplicate the optional presentation callback under Strict Mode replay', () => {
    const onPresented = vi.fn();
    render(
      <StrictMode>
        <IncomingCallModal
          callerName="Alice"
          onAccept={onAccept}
          onReject={onReject}
          presentationKey="call-1"
          onPresented={onPresented}
        />
      </StrictMode>,
    );

    expect(onPresented).toHaveBeenCalledTimes(1);
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
