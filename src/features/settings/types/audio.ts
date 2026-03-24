export type AudioState = "A" | "B" | "C" | "D";

export interface AudioConstraints {
  micEnabled: boolean;
  soundEnabled: boolean;
  micCascaded: boolean;
  lastVoluntaryMic: boolean;
}

