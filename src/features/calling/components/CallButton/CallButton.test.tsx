import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CallButton } from './CallButton';
import type { CallStatus } from '../../hooks/useCall.types';

// ── CSS Modules mock ──────────────────────────────────────────────────────────
vi.mock('./CallButton.module.css', () => ({
  default: {
    callBtn: 'callBtn',
    phoneIcon: 'phoneIcon',
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALL_STATUSES: CallStatus[] = ['idle', 'calling', 'ringing', 'active', 'ended'];

function renderButton(
  status: CallStatus = 'idle',
  onCall = vi.fn(),
) {
  return render(
    <CallButton
      targetUserId={42}
      targetUsername="Alice"
      status={status}
      onCall={onCall}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CallButton', () => {
  let onCall: Mock<(targetUserId: number) => void>;

  beforeEach(() => {
    onCall = vi.fn();
  });

  // ── Рендер ──────────────────────────────────────────────────────────────────

  it('рендерится без ошибок', () => {
    renderButton('idle', onCall);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('содержит SVG иконку телефона', () => {
    const { container } = renderButton();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('имеет aria-label с именем пользователя', () => {
    renderButton();
    expect(
      screen.getByRole('button', { name: /Позвонить Alice/i }),
    ).toBeTruthy();
  });

  // ── Состояние idle ───────────────────────────────────────────────────────────

  it('НЕ disabled когда status === "idle"', () => {
    renderButton('idle', onCall);
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('title содержит имя пользователя когда idle', () => {
    renderButton('idle', onCall);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('title')).toContain('Alice');
  });

  // ── Disabled состояния ───────────────────────────────────────────────────────

  it.each(ALL_STATUSES.filter((s) => s !== 'idle'))(
    'disabled когда status === "%s"',
    (status) => {
      renderButton(status, onCall);
      expect(screen.getByRole('button')).toBeDisabled();
    },
  );

  it.each(ALL_STATUSES.filter((s) => s !== 'idle'))(
    'title содержит статус "%s" когда кнопка disabled',
    (status) => {
      renderButton(status, onCall);
      const btn = screen.getByRole('button');
      expect(btn.getAttribute('title')).toContain(status);
    },
  );

  // ── Клик ────────────────────────────────────────────────────────────────────

  it('вызывает onCall с targetUserId при клике (status idle)', () => {
    renderButton('idle', onCall);
    fireEvent.click(screen.getByRole('button'));
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledWith(42);
  });

  it('НЕ вызывает onCall при клике когда disabled', () => {
    renderButton('calling', onCall);
    fireEvent.click(screen.getByRole('button'));
    expect(onCall).not.toHaveBeenCalled();
  });

  it('передаёт правильный targetUserId при каждом клике', () => {
    render(
      <CallButton
        targetUserId={99}
        targetUsername="Bob"
        status="idle"
        onCall={onCall}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onCall).toHaveBeenCalledWith(99);
  });
});
