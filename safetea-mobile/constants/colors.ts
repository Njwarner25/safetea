// SafeTea Design Tokens — aligned with web app CSS variables
export const Colors = {
  // Core palette
  background: '#1A1A2E',
  surface: '#22223A',
  surfaceLight: '#22223A',
  surfaceDark: '#141428',
  surfaceHover: '#2A2A4A',

  // Brand (dusty pink — matches web --pink)
  coral: '#E8A0B5',
  coralLight: '#F2C4D4',
  coralDark: '#D4768E',
  coralMuted: 'rgba(232, 160, 181, 0.15)',
  pink: '#E8A0B5',
  pinkMuted: 'rgba(232, 160, 181, 0.15)',
  pinkGlow: 'rgba(232, 160, 181, 0.15)',
  purple: '#9b59b6',
  purpleMuted: 'rgba(155, 89, 182, 0.15)',

  // Text (warm beige — matches web --text)
  textPrimary: '#F0D0C0',
  textSecondary: '#F5E0D5',
  textMuted: '#8080A0',
  textInverse: '#1A1A2E',

  // Status (matches web)
  success: '#2ecc71',
  successMuted: 'rgba(46, 204, 113, 0.15)',
  warning: '#f1c40f',
  warningMuted: 'rgba(241, 196, 15, 0.15)',
  danger: '#e74c3c',
  dangerMuted: 'rgba(231, 76, 60, 0.15)',
  info: '#3498db',
  infoMuted: 'rgba(52, 152, 219, 0.15)',

  // Trust levels
  trustVerified: '#2ecc71',
  trustPending: '#f1c40f',
  trustNew: '#8080A0',

  // Borders
  border: 'rgba(255, 255, 255, 0.06)',
  borderLight: 'rgba(255, 255, 255, 0.12)',
  borderFocus: '#E8A0B5',

  // Overlays
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',

  // Gradients (used as arrays)
  gradientPrimary: ['#E8A0B5', '#D4768E'],
  gradientPink: ['#E8A0B5', '#D4768E'],
  gradientDark: ['#1A1A2E', '#22223A'],
  gradientCard: ['rgba(34, 34, 58, 0.8)', 'rgba(26, 26, 46, 0.6)'],
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  display: 32,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};
