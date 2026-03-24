// client/src/themes.ts
export type Theme = 'dark' | 'light' | 'amoled' | 'midnight'

export const themes: Record<Theme, string> = {
  dark: 'dark',
  light: 'light',
  amoled: 'amoled',
  midnight: 'midnight',
}

export const themeLabels: Record<Theme, string> = {
  dark: 'Тёмная',
  light: 'Светлая',
  amoled: 'AMOLED',
  midnight: 'Midnight',
}
