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

    render(
      <CallAudioRenderer
        remoteStream={remoteStream}
        selectedOutputDeviceId="default"
        soundEnabled
        outputVolume={1}
      />,
    );

    const audio = screen.getByTestId('call-audio-renderer') as HTMLAudioElement;
    expect(audio.srcObject).toBe(remoteStream);
  });

  it('clears srcObject when the remote stream becomes null', () => {
    const remoteStream = new MediaStream();
    const { rerender } = render(
      <CallAudioRenderer
        remoteStream={remoteStream}
        selectedOutputDeviceId="default"
        soundEnabled
        outputVolume={1}
      />
    );

    rerender(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="default"
        soundEnabled
        outputVolume={1}
      />,
    );

    const audio = screen.getByTestId('call-audio-renderer') as HTMLAudioElement;
    expect(audio.srcObject).toBeNull();
  });

  it('clears srcObject on unmount', () => {
    const remoteStream = new MediaStream();
    const { unmount } = render(
      <CallAudioRenderer
        remoteStream={remoteStream}
        selectedOutputDeviceId="default"
        soundEnabled
        outputVolume={1}
      />
    );
    const audio = screen.getByTestId('call-audio-renderer') as HTMLAudioElement;

    expect(audio.srcObject).toBe(remoteStream);

    unmount();
    expect(audio.srcObject).toBeNull();
  });

  it('does not pause unrelated document media during cleanup', () => {
    const externalVideo = document.createElement('video');
    const externalPause = vi.fn();
    Object.defineProperty(externalVideo, 'pause', {
      value: externalPause,
      configurable: true,
    });
    document.body.appendChild(externalVideo);
    const remoteStream = new MediaStream();

    const { rerender, unmount } = render(
      <CallAudioRenderer
        remoteStream={remoteStream}
        selectedOutputDeviceId="default"
        soundEnabled
        outputVolume={1}
      />
    );

    rerender(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="default"
        soundEnabled
        outputVolume={1}
      />,
    );
    unmount();

    expect(externalPause).not.toHaveBeenCalled();
    externalVideo.remove();
  });

  it('calls setSinkId with the selected output device when supported', async () => {
    render(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="speaker-123"
        soundEnabled
        outputVolume={1}
      />,
    );

    await waitFor(() => {
      expect(setSinkIdMock).toHaveBeenCalledWith('speaker-123');
    });
  });

  it('does not throw when setSinkId is unsupported', () => {
    Reflect.deleteProperty(HTMLMediaElement.prototype, 'setSinkId');

    expect(() => {
      render(
        <CallAudioRenderer
          remoteStream={null}
          selectedOutputDeviceId="speaker-123"
          soundEnabled
          outputVolume={1}
        />,
      );
    }).not.toThrow();
  });

  it('catches rejected setSinkId promises', async () => {
    const error = new Error('sink failed');
    setSinkIdMock.mockRejectedValueOnce(error);

    render(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="speaker-123"
        soundEnabled
        outputVolume={1}
      />,
    );

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[CallAudioRenderer] Failed to apply output device',
        error,
      );
    });
  });

  it('falls back to default when the selected output device no longer exists', async () => {
    const onOutputDeviceFallback = vi.fn();
    setSinkIdMock
      .mockRejectedValueOnce(new DOMException('The object can not be found here', 'NotFoundError'))
      .mockResolvedValueOnce(undefined);

    render(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="speaker-123"
        soundEnabled
        outputVolume={1}
        onOutputDeviceFallback={onOutputDeviceFallback}
      />
    );

    await waitFor(() => {
      expect(onOutputDeviceFallback).toHaveBeenCalledTimes(1);
      expect(onOutputDeviceFallback).toHaveBeenCalledWith('speaker-123');
      expect(setSinkIdMock).toHaveBeenNthCalledWith(1, 'speaker-123');
      expect(setSinkIdMock).toHaveBeenNthCalledWith(2, 'default');
    });

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('can fall back again if the same missing output device is reselected later', async () => {
    const onOutputDeviceFallback = vi.fn();
    setSinkIdMock
      .mockRejectedValueOnce(new DOMException('The object can not be found here', 'NotFoundError'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new DOMException('The object can not be found here', 'NotFoundError'))
      .mockResolvedValueOnce(undefined);

    const { rerender } = render(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="speaker-123"
        soundEnabled
        outputVolume={1}
        onOutputDeviceFallback={onOutputDeviceFallback}
      />
    );

    await waitFor(() => {
      expect(onOutputDeviceFallback).toHaveBeenCalledTimes(1);
    });

    rerender(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="default"
        soundEnabled
        outputVolume={1}
        onOutputDeviceFallback={onOutputDeviceFallback}
      />
    );

    await waitFor(() => {
      expect(setSinkIdMock).toHaveBeenCalledWith('default');
    });

    rerender(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="speaker-123"
        soundEnabled
        outputVolume={1}
        onOutputDeviceFallback={onOutputDeviceFallback}
      />
    );

    await waitFor(() => {
      expect(onOutputDeviceFallback).toHaveBeenCalledTimes(2);
    });
  });

  it('handles setSinkId SecurityError without warning spam or fallback reset', async () => {
    const onOutputDeviceFallback = vi.fn();
    setSinkIdMock.mockRejectedValueOnce(
      new DOMException('The operation is insecure.', 'SecurityError'),
    );

    render(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="speaker-123"
        soundEnabled
        outputVolume={1}
        onOutputDeviceFallback={onOutputDeviceFallback}
      />
    );

    await waitFor(() => {
      expect(setSinkIdMock).toHaveBeenCalledWith('speaker-123');
    });

    expect(onOutputDeviceFallback).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('handles missing default output device without warning spam', async () => {
    setSinkIdMock.mockRejectedValue(
      new DOMException('The object can not be found here', 'NotFoundError'),
    );

    const { rerender } = render(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="default"
        soundEnabled
        outputVolume={1}
      />
    );

    await waitFor(() => {
      expect(setSinkIdMock).toHaveBeenCalledWith('default');
    });

    rerender(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="default"
        soundEnabled
        outputVolume={1}
      />,
    );

    await waitFor(() => {
      expect(setSinkIdMock).toHaveBeenCalledTimes(1);
    });

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when selected and fallback output devices are both missing', async () => {
    const onOutputDeviceFallback = vi.fn();
    setSinkIdMock
      .mockRejectedValueOnce(new DOMException('The object can not be found here', 'NotFoundError'))
      .mockRejectedValueOnce(new DOMException('The object can not be found here', 'NotFoundError'));

    render(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="speaker-123"
        soundEnabled
        outputVolume={1}
        onOutputDeviceFallback={onOutputDeviceFallback}
      />
    );

    await waitFor(() => {
      expect(onOutputDeviceFallback).toHaveBeenCalledWith('speaker-123');
      expect(setSinkIdMock).toHaveBeenNthCalledWith(1, 'speaker-123');
      expect(setSinkIdMock).toHaveBeenNthCalledWith(2, 'default');
    });

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('applies soundEnabled and outputVolume to remote playback', () => {
    const { rerender } = render(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="default"
        soundEnabled
        outputVolume={0.4}
      />,
    );

    const audio = screen.getByTestId('call-audio-renderer') as HTMLAudioElement;
    expect(audio.muted).toBe(false);
    expect(audio.volume).toBeCloseTo(0.4);

    rerender(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="default"
        soundEnabled={false}
        outputVolume={0.4}
      />,
    );

    expect(audio.muted).toBe(true);
    expect(audio.volume).toBeCloseTo(0.4);

    rerender(
      <CallAudioRenderer
        remoteStream={null}
        selectedOutputDeviceId="default"
        soundEnabled
        outputVolume={0}
      />,
    );

    expect(audio.muted).toBe(true);
    expect(audio.volume).toBe(0);
  });

  it('applies per-user volume and mute to the real audio element', () => {
    const { rerender } = render(
      <CallAudioRenderer remoteStream={null} selectedOutputDeviceId="default" soundEnabled outputVolume={0.8} callUserVolume={50} callUserMuted={false} />,
    );
    const audio = screen.getByTestId('call-audio-renderer') as HTMLAudioElement;
    expect(audio.volume).toBeCloseTo(0.4);

    rerender(<CallAudioRenderer remoteStream={null} selectedOutputDeviceId="default" soundEnabled outputVolume={0.8} callUserVolume={50} callUserMuted />);
    expect(audio.volume).toBe(0);
    expect(audio.muted).toBe(true);

    rerender(<CallAudioRenderer remoteStream={null} selectedOutputDeviceId="default" soundEnabled outputVolume={0.8} callUserVolume={50} callUserMuted={false} />);
    expect(audio.volume).toBeCloseTo(0.4);
  });
});
