import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CallAudioRenderer } from './CallAudioRenderer';

class MockMediaStream {}

describe('CallAudioRenderer', () => {
  beforeAll(() => {
    global.MediaStream = MockMediaStream as typeof MediaStream;
  });

  it('attaches the remote stream to the audio element', () => {
    const remoteStream = new MediaStream();

    render(<CallAudioRenderer remoteStream={remoteStream} />);

    const audio = screen.getByTestId('call-audio-renderer') as HTMLAudioElement;
    expect(audio.srcObject).toBe(remoteStream);
  });

  it('clears srcObject when the remote stream becomes null', () => {
    const remoteStream = new MediaStream();
    const { rerender } = render(<CallAudioRenderer remoteStream={remoteStream} />);

    rerender(<CallAudioRenderer remoteStream={null} />);

    const audio = screen.getByTestId('call-audio-renderer') as HTMLAudioElement;
    expect(audio.srcObject).toBeNull();
  });

  it('clears srcObject on unmount', () => {
    const remoteStream = new MediaStream();
    const { unmount } = render(<CallAudioRenderer remoteStream={remoteStream} />);
    const audio = screen.getByTestId('call-audio-renderer') as HTMLAudioElement;

    expect(audio.srcObject).toBe(remoteStream);

    unmount();
    expect(audio.srcObject).toBeNull();
  });
});
