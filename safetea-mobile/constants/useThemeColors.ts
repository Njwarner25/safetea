import { useColorScheme } from 'react-native';
import { DarkColors, LightColors } from './colors';

export function useThemeColors() {
  const scheme = useColorScheme();
  return scheme === 'light' ? LightColors : DarkColors;
}
