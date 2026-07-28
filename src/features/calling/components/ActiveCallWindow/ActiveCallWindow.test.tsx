import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ActiveCallWindow } from './ActiveCallWindow';
import type { CallDiagnostics, CallIssue } from '../../hooks/useCall.types';

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
  isScreenShareUpdating = false,
  isRemoteScreenLoading = false,
  callIssue = null,
  remoteScreenStream = null,
  localScreenStream = null,
  muted = false,
  effectiveMuted,
  deafened = false,
  canToggleMute = true,
  canToggleDeafen = true,
  onStartScreenShare = async () => undefined,
  onStopScreenShare = () => undefined,
  onMuteToggle = vi.fn(),
  onDeafenToggle = vi.fn(),
} : {
  diagnostics?: CallDiagnostics;
  isScreenSharing?: boolean;
  isScreenShareUpdating?: boolean;
  isRemoteScreenLoading?: boolean;
  callIssue?: CallIssue | null;
  remoteScreenStream?: MediaStream | null;
  localScreenStream?: MediaStream | null;
  muted?: boolean;
  effectiveMuted?: boolean;
  deafened?: boolean;
  canToggleMute?: boolean;
  canToggleDeafen?: boolean;
  onStartScreenShare?: () => Promise<void>;
  onStopScreenShare?: () => void;
  onMuteToggle?: () => void;
  onDeafenToggle?: () => void;
} = {}) {
  return render(
    <ActiveCallWindow
      remoteUsername="Alice"
      seconds={12}
      isMuted={muted}
      muted={muted}
      effectiveMuted={effectiveMuted}
      deafened={deafened}
      canToggleMute={canToggleMute}
      canToggleDeafen={canToggleDeafen}
      isScreenSharing={isScreenSharing}
      isScreenShareUpdating={isScreenShareUpdating}
      isRemoteScreenLoading={isRemoteScreenLoading}
      callIssue={callIssue}
      remoteScreenStream={remoteScreenStream}
      localScreenStream={localScreenStream}
      diagnostics={diagnostics}
      onMuteToggle={onMuteToggle}
      onDeafenToggle={onDeafenToggle}
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
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  it('uses effective mute and deafen state for accessible controls', () => {
    const onMuteToggle = vi.fn();
    const onDeafenToggle = vi.fn();
    renderWindow({
      muted: false,
      effectiveMuted: true,
      deafened: true,
      onMuteToggle,
      onDeafenToggle,
    });

    const microphone = screen.getByRole('button', { name: 'Microphone muted while deafened' });
    const deafen = screen.getByRole('button', { name: 'Undeafen' });
    expect(microphone).toHaveAttribute('aria-pressed', 'true');
    expect(deafen).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(microphone);
    fireEvent.click(deafen);
    expect(onMuteToggle).toHaveBeenCalledTimes(1);
    expect(onDeafenToggle).toHaveBeenCalledTimes(1);
  });

  it('derives effective mute from mute and deafen when omitted', () => {
    renderWindow({ muted: false, deafened: true, effectiveMuted: undefined });

    expect(screen.getByRole('button', { name: 'Microphone muted while deafened' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps effective mute false when both preferences are false and omitted', () => {
    renderWindow({ muted: false, deafened: false, effectiveMuted: undefined });

    expect(screen.getByRole('button', { name: 'Mute' })).toHaveAttribute('aria-pressed', 'false');
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

  it('shows a connecting label before the peer is fully connected', () => {
    renderWindow({
      diagnostics: {
        ...defaultDiagnostics,
        connectionState: 'connecting',
        iceConnectionState: 'checking',
      },
    });

    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });

  it('shows a screen sharing label while local sharing is active', () => {
    renderWindow({
      isScreenSharing: true,
      localScreenStream: new MediaStream(),
    });

    expect(screen.getByText('Screen sharing')).toBeInTheDocument();
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
        isScreenShareUpdating={false}
        isRemoteScreenLoading={false}
        callIssue={null}
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
        isScreenShareUpdating={false}
        isRemoteScreenLoading={false}
        callIssue={null}
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
        isScreenShareUpdating={false}
        isRemoteScreenLoading={false}
        callIssue={null}
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

  it('shows a loading placeholder while the remote screen track is not yet unmuted', () => {
    renderWindow({
      isRemoteScreenLoading: true,
      remoteScreenStream: null,
    });

    expect(screen.getByTestId('remote-screen-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('remote-screen-view')).not.toBeInTheDocument();
  });

  it('disables the screen-share button while the screen-share transaction is updating', () => {
    const onStartScreenShare = vi.fn().mockResolvedValue(undefined);
    renderWindow({
      isScreenShareUpdating: true,
      onStartScreenShare,
    });

    const button = screen.getByRole('button', { name: 'Updating screen share' });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Updating...');
    expect(screen.getByText('Updating screen share...')).toBeInTheDocument();

    fireEvent.click(button);
    expect(onStartScreenShare).not.toHaveBeenCalled();
  });

  it('shows a call issue banner when a user-friendly error is present', () => {
    renderWindow({
      callIssue: {
        tone: 'error',
        message: 'Screen share permission denied.',
      },
    });

    expect(screen.getByTestId('call-issue-banner')).toHaveTextContent('Screen share permission denied.');
  });
});
