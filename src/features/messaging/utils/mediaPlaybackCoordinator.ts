let activeMediaAudio: HTMLAudioElement | null = null;

export function claimMediaAudio(audio: HTMLAudioElement) {
  if (activeMediaAudio && activeMediaAudio !== audio) activeMediaAudio.pause();
  activeMediaAudio = audio;
}

export function releaseMediaAudio(audio: HTMLAudioElement) {
  if (activeMediaAudio === audio) activeMediaAudio = null;
}
