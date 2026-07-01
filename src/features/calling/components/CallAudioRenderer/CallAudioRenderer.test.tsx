import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CallAudioRenderer } from './CallAudioRenderer';

class MockMediaStream {}

describe('CallAudioRenderer', () => {
  let setSinkIdMock: ReturnType<typeof vi.fn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    global.MediaStream = MockMediaStream as typeof MediaStream;
  });

  beforeEach(() => {
    setSinkIdMock = vi.fn().mockResolvedValue(undefined);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
      value: setSinkIdMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    Reflect.deleteProperty(HTMLMediaElement.prototype, 'setSinkId');
  });

  it('attaches the remote stream to the audio element', () => {
    const remoteStream = new MediaStream();

    render(<CallAudioRenderer remoteStream={remoteStream} selectedOutputDeviceId="default" />);

    const audio = screen.getByTestId('call-audio-renderer') as HTMLAudioElement;
    expect(audio.srcObject).toBe(remoteStream);
  });

  it('clears srcObject when the remote stream becomes null', () => {
    const remoteStream = new MediaStream();
    const { rerender } = render(
      <CallAudioRenderer remoteStream={remoteStream} selectedOutputDeviceId="default" />
    );

    rerender(<CallAudioRenderer remoteStream={null} selectedOutputDeviceId="default" />);

    const audio = screen.getByTestId('call-audio-renderer') as HTMLAudioElement;
    expect(audio.srcObject).toBeNull();
  });

  it('clears srcObject on unmount', () => {
    const remoteStream = new MediaStream();
    const { unmount } = render(
      <CallAudioRenderer remoteStream={remoteStream} selectedOutputDeviceId="default" />
    );
    const audio = screen.getByTestId('call-audio-renderer') as HTMLAudioElement;

    expect(audio.srcObject).toBe(remoteStream);

    unmount();
    expect(audio.srcObject).toBeNull();
  });

  it('calls setSinkId with the selected output device when supported', async () => {
    render(<CallAudioRenderer remoteStream={null} selectedOutputDeviceId="speaker-123" />);

    await waitFor(() => {
      expect(setSinkIdMock).toHaveBeenCalledWith('speaker-123');
    });
  });

  it('does not throw when setSinkId is unsupported', () => {
    Reflect.deleteProperty(HTMLMediaElement.prototype, 'setSinkId');

    expect(() => {
      render(<CallAudioRenderer remoteStream={null} selectedOutputDeviceId="speaker-123" />);
    }).not.toThrow();
  });

  it('catches rejected setSinkId promises', async () => {
    const error = new Error('sink failed');
    setSinkIdMock.mockRejectedValueOnce(error);

    render(<CallAudioRenderer remoteStream={null} selectedOutputDeviceId="speaker-123" />);

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[CallAudioRenderer] Failed to apply output device',
        error,
      );
    });
  });
});
