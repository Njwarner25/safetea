import { DarkColors } from './colors';

// Dark-only by design — matches userInterfaceStyle: 'dark' in app.config.ts.
// Don't reintroduce a light-mode switch.
export function useThemeColors() {
  return DarkColors;
}
