import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

class MockMediaStream {}

function renderWindow({
  diagnostics = defaultDiagnostics,
  isScreenSharing = false,
  remoteScreenStream = null,
  localScreenStream = null,
  onStartScreenShare = async () => undefined,
  onStopScreenShare = () => undefined,
} : {
  diagnostics?: CallDiagnostics;
  isScreenSharing?: boolean;
  remoteScreenStream?: MediaStream | null;
  localScreenStream?: MediaStream | null;
  onStartScreenShare?: () => Promise<void>;
  onStopScreenShare?: () => void;
} = {}) {
  return render(
    <ActiveCallWindow
      remoteUsername="Alice"
      seconds={12}
      isMuted={false}
      isScreenSharing={isScreenSharing}
      remoteScreenStream={remoteScreenStream}
      localScreenStream={localScreenStream}
      diagnostics={diagnostics}
      onMuteToggle={vi.fn()}
      onStartScreenShare={onStartScreenShare}
      onStopScreenShare={onStopScreenShare}
      onHangUp={vi.fn()}
    />,
  );
}

describe('ActiveCallWindow', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    global.MediaStream = MockMediaStream as typeof MediaStream;
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
      diagnostics: {
        ...defaultDiagnostics,
        selectedLocalCandidateType: 'srflx',
      },
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

  it('shows the share screen button during an active call', () => {
    renderWindow();

    expect(screen.getByRole('button', { name: 'Share screen' })).toBeInTheDocument();
  });

  it('clicking share screen calls startScreenShare', () => {
    const onStartScreenShare = vi.fn().mockResolvedValue(undefined);
    renderWindow({ onStartScreenShare });

    fireEvent.click(screen.getByRole('button', { name: 'Share screen' }));

    expect(onStartScreenShare).toHaveBeenCalledTimes(1);
  });

  it('clicking stop sharing calls stopScreenShare', () => {
    const onStopScreenShare = vi.fn();
    renderWindow({
      isScreenSharing: true,
      localScreenStream: new MediaStream(),
      onStopScreenShare,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));

    expect(onStopScreenShare).toHaveBeenCalledTimes(1);
  });

  it('shows the local screen preview when a screen stream exists', () => {
    renderWindow({
      isScreenSharing: true,
      localScreenStream: new MediaStream(),
    });

    expect(screen.getByTestId('local-screen-preview')).toBeInTheDocument();
    expect(screen.getByText('Local Preview Only')).toBeInTheDocument();
  });

  it('shows the remote shared screen when a remote screen stream exists', () => {
    renderWindow({
      remoteScreenStream: new MediaStream(),
    });

    expect(screen.getByTestId('remote-screen-view')).toBeInTheDocument();
    expect(screen.getByText('Remote Screen')).toBeInTheDocument();
  });

  it('can hide and show the remote shared screen again', () => {
    const firstStream = new MediaStream();
    const secondStream = new MediaStream();
    const { rerender } = renderWindow({
      remoteScreenStream: firstStream,
    });

    expect(screen.getByTestId('remote-screen-view')).toBeInTheDocument();

    rerender(
      <ActiveCallWindow
        remoteUsername="Alice"
        seconds={12}
        isMuted={false}
        isScreenSharing={false}
        remoteScreenStream={null}
        localScreenStream={null}
        diagnostics={defaultDiagnostics}
        onMuteToggle={vi.fn()}
        onStartScreenShare={async () => undefined}
        onStopScreenShare={vi.fn()}
        onHangUp={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('remote-screen-view')).not.toBeInTheDocument();

    rerender(
      <ActiveCallWindow
        remoteUsername="Alice"
        seconds={12}
        isMuted={false}
        isScreenSharing={false}
        remoteScreenStream={secondStream}
        localScreenStream={null}
        diagnostics={defaultDiagnostics}
        onMuteToggle={vi.fn()}
        onStartScreenShare={async () => undefined}
        onStopScreenShare={vi.fn()}
        onHangUp={vi.fn()}
      />,
    );

    expect(screen.getByTestId('remote-screen-view')).toBeInTheDocument();
  });

  it('detaches the remote video element when the remote stream clears', () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const { rerender } = renderWindow({
      remoteScreenStream: new MediaStream(),
    });

    expect(screen.getByTestId('remote-screen-view')).toBeInTheDocument();

    rerender(
      <ActiveCallWindow
        remoteUsername="Alice"
        seconds={12}
        isMuted={false}
        isScreenSharing={false}
        remoteScreenStream={null}
        localScreenStream={null}
        diagnostics={defaultDiagnostics}
        onMuteToggle={vi.fn()}
        onStartScreenShare={async () => undefined}
        onStopScreenShare={vi.fn()}
        onHangUp={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('remote-screen-view')).not.toBeInTheDocument();
    expect(pauseSpy).toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalled();

    pauseSpy.mockRestore();
    loadSpy.mockRestore();
  });
});
