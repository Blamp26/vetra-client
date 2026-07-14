import { createContext, useContext } from "react";

export interface MediaVisibilityContextValue {
  root: HTMLElement | null;
  revision: number;
}

const defaultValue: MediaVisibilityContextValue = {
  root: null,
  revision: 0,
};

export const MediaVisibilityContext = createContext<MediaVisibilityContextValue>(defaultValue);

export function useMediaVisibility(): MediaVisibilityContextValue {
  return useContext(MediaVisibilityContext);
}
