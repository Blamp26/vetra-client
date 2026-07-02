import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CallButton } from './CallButton';
import type { CallStatus } from '../../hooks/useCall.types';
import type { ResourceRef } from '@/shared/types';

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
  let onCall: Mock<(targetUserId: ResourceRef) => void>;

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
      screen.getByRole('button', { name: /Call Alice/i }),
    ).toBeTruthy();
  });

  // ── Состояние idle ───────────────────────────────────────────────────────────

  it('НЕ disabled когда status === "idle"', () => {
    renderButton('idle', onCall);
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('is disabled with a temporary reason while the call service is connecting', () => {
    render(
      <CallButton
        targetUserId={42}
        targetUsername="Alice"
        status="idle"
        callServiceStatus="connecting"
        onCall={onCall}
      />,
    );

    const button = screen.getByRole('button', {
      name: 'Call service is connecting. Try again in a moment.',
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'title',
      'Call service is connecting. Try again in a moment.',
    );
  });

  it('title содержит имя пользователя когда idle', () => {
    renderButton('idle', onCall);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('title')).toContain('Call Alice');
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
    'title explains why the button is disabled for status "%s"',
    (status) => {
      renderButton(status, onCall);
      const btn = screen.getByRole('button');
      expect(btn.getAttribute('title')).toContain('Call unavailable while');
    },
  );

  // ── Клик ────────────────────────────────────────────────────────────────────

  it('вызывает onCall с targetUserId при клике (status idle)', () => {
    renderButton('idle', onCall);
    fireEvent.click(screen.getByRole('button'));
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledWith(42, 'Alice');
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
    expect(onCall).toHaveBeenCalledWith(99, 'Bob');
  });

  it('reports a missing target instead of silently doing nothing', () => {
    const onUnavailable = vi.fn();
    render(
      <CallButton
        targetUserId={null}
        targetUsername="Unknown"
        status="idle"
        onCall={onCall}
        onUnavailable={onUnavailable}
      />,
    );

    const button = screen.getByRole('button', { name: 'Call unavailable' });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    expect(onCall).not.toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledWith(
      'Cannot start call because this user is missing call target information.',
    );
  });
});
