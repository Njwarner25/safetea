// SafeTea Design Tokens
export const Colors = {
  // Core palette
  background: '#1A1A2E',
  surface: '#16213E',
  surfaceLight: '#1E2A47',
  surfaceHover: '#243352',
  
  // Brand
  coral: '#E8513F',
  coralLight: '#FF6B5A',
  coralDark: '#C4402F',
  coralMuted: 'rgba(232, 81, 63, 0.15)',
  pink: '#E8513F',
  pinkMuted: 'rgba(232, 81, 63, 0.15)',
  
  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A0AEC0',
  textMuted: '#718096',
  textInverse: '#1A1A2E',
  
  // Status
  success: '#48BB78',
  successMuted: 'rgba(72, 187, 120, 0.15)',
  warning: '#ECC94B',
  warningMuted: 'rgba(236, 201, 75, 0.15)',
  danger: '#FC8181',
  dangerMuted: 'rgba(252, 129, 129, 0.15)',
  info: '#63B3ED',
  infoMuted: 'rgba(99, 179, 237, 0.15)',
  
  // Trust levels
  trustVerified: '#48BB78',
  trustPending: '#ECC94B',
  trustNew: '#A0AEC0',
  
  // Borders
  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.12)',
  borderFocus: '#E8513F',
  
  // Overlays
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  
  // Gradients (used as arrays)
  gradientPrimary: ['#E8513F', '#FF6B5A'],
  gradientDark: ['#1A1A2E', '#16213E'],
  gradientCard: ['rgba(30, 42, 71, 0.8)', 'rgba(22, 33, 62, 0.6)'],
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
