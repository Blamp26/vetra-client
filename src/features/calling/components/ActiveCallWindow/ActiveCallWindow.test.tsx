import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ActiveCallWindow } from './ActiveCallWindow';
import type { CallDiagnostics } from '../../hooks/useCall.types';

const defaultDiagnostics: CallDiagnostics = {
  connectionState: 'connected',
  iceConnectionState: 'connected',
  iceGatheringState: 'complete',
  signalingState: 'stable',
  selectedLocalCandidateType: 'relay',
};

function renderWindow(diagnostics: CallDiagnostics = defaultDiagnostics) {
  return render(
    <ActiveCallWindow
      remoteUsername="Alice"
      seconds={12}
      isMuted={false}
      diagnostics={diagnostics}
      onMuteToggle={vi.fn()}
      onHangUp={vi.fn()}
    />,
  );
}

describe('ActiveCallWindow', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('hides diagnostics by default', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_WEBRTC_SHOW_DIAGNOSTICS', 'false');

    renderWindow();

    expect(screen.queryByTestId('webrtc-diagnostics')).not.toBeInTheDocument();
  });

  it('shows diagnostics when the debug flag is enabled', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_WEBRTC_SHOW_DIAGNOSTICS', 'true');

    renderWindow();

    const diagnostics = screen.getByTestId('webrtc-diagnostics');
    expect(diagnostics).toBeInTheDocument();
    expect(diagnostics).toHaveTextContent('connection');
    expect(diagnostics).toHaveTextContent('ice');
    expect(diagnostics).toHaveTextContent('complete');
    expect(diagnostics).toHaveTextContent('stable');
    expect(diagnostics).toHaveTextContent('relay');
  });

  it('does not render sensitive fields', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_WEBRTC_SHOW_DIAGNOSTICS', 'true');

    renderWindow({
      ...defaultDiagnostics,
      selectedLocalCandidateType: 'srflx',
    });

    const diagnosticsText = screen.getByTestId('webrtc-diagnostics').textContent ?? '';
    expect(diagnosticsText).not.toContain('turn-user');
    expect(diagnosticsText).not.toContain('turn-pass');
    expect(diagnosticsText).not.toContain('token');
    expect(diagnosticsText).not.toContain('candidate:');
  });

  it('does not own remote audio playback', () => {
    const { container } = renderWindow();

    expect(container.querySelector('audio')).toBeNull();
  });
});
