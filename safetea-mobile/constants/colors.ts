// SafeTea / LinkHer Design Tokens
// iOS builds = LinkHer (sister app, App Store rebrand)
// Android + web = SafeTea
import { Platform } from 'react-native';

const isIOS = Platform.OS === 'ios';

// SafeTea Dark (Android + web default)
const SafeTeaDark = {
  background: '#1A1A2E',
  surface: '#22223A',
  surfaceLight: '#22223A',
  surfaceDark: '#141428',
  surfaceHover: '#2A2A4A',

  coral: '#E8A0B5',
  coralLight: '#F2C4D4',
  coralDark: '#D4768E',
  coralMuted: 'rgba(232, 160, 181, 0.15)',
  pink: '#E8A0B5',
  pinkMuted: 'rgba(232, 160, 181, 0.15)',
  pinkGlow: 'rgba(232, 160, 181, 0.15)',
  purple: '#9b59b6',
  purpleMuted: 'rgba(155, 89, 182, 0.15)',

  textPrimary: '#F0D0C0',
  textSecondary: '#F5E0D5',
  textMuted: '#8080A0',
  textInverse: '#1A1A2E',

  success: '#2ecc71',
  successMuted: 'rgba(46, 204, 113, 0.15)',
  warning: '#f1c40f',
  warningMuted: 'rgba(241, 196, 15, 0.15)',
  danger: '#e74c3c',
  dangerMuted: 'rgba(231, 76, 60, 0.15)',
  info: '#3498db',
  infoMuted: 'rgba(52, 152, 219, 0.15)',

  trustVerified: '#2ecc71',
  trustPending: '#f1c40f',
  trustNew: '#8080A0',

  border: 'rgba(255, 255, 255, 0.06)',
  borderLight: 'rgba(255, 255, 255, 0.12)',
  borderFocus: '#E8A0B5',

  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',

  gradientPrimary: ['#E8A0B5', '#D4768E'] as const,
  gradientPink: ['#E8A0B5', '#D4768E'] as const,
  gradientDark: ['#1A1A2E', '#22223A'] as const,
  gradientCard: ['rgba(34, 34, 58, 0.8)', 'rgba(26, 26, 46, 0.6)'] as const,

  vault: '#C9A84C',
  vaultMuted: 'rgba(201, 168, 76, 0.12)',
  vaultBorder: 'rgba(201, 168, 76, 0.2)',
  vaultGradientStart: 'rgba(201, 168, 76, 0.18)',
  vaultGradientEnd: 'rgba(201, 168, 76, 0.05)',

  sosBannerStart: 'rgba(231, 76, 60, 0.25)',
  sosBannerEnd: 'rgba(155, 89, 182, 0.15)',
  sosBannerBorder: 'rgba(231, 76, 60, 0.2)',
  sosHighlightBg: 'rgba(231, 76, 60, 0.12)',
  sosHighlightBorder: 'rgba(231, 76, 60, 0.15)',
};

// SafeTea Light (Android + web default)
const SafeTeaLight = {
  background: '#F8F6F3',
  surface: '#FFFFFF',
  surfaceLight: '#FFFFFF',
  surfaceDark: '#F0EDE8',
  surfaceHover: '#F5F2EE',

  coral: '#C4708A',
  coralLight: '#E8A0B5',
  coralDark: '#A35570',
  coralMuted: 'rgba(196, 112, 138, 0.12)',
  pink: '#C4708A',
  pinkMuted: 'rgba(196, 112, 138, 0.12)',
  pinkGlow: 'rgba(196, 112, 138, 0.08)',
  purple: '#8E44AD',
  purpleMuted: 'rgba(142, 68, 173, 0.10)',

  textPrimary: '#2C2438',
  textSecondary: '#4A3F55',
  textMuted: '#8E8698',
  textInverse: '#FFFFFF',

  success: '#27AE60',
  successMuted: 'rgba(39, 174, 96, 0.10)',
  warning: '#D4A017',
  warningMuted: 'rgba(212, 160, 23, 0.10)',
  danger: '#C0392B',
  dangerMuted: 'rgba(192, 57, 43, 0.10)',
  info: '#2980B9',
  infoMuted: 'rgba(41, 128, 185, 0.10)',

  trustVerified: '#27AE60',
  trustPending: '#D4A017',
  trustNew: '#8E8698',

  border: 'rgba(0, 0, 0, 0.08)',
  borderLight: 'rgba(0, 0, 0, 0.05)',
  borderFocus: '#C4708A',

  overlay: 'rgba(0, 0, 0, 0.3)',
  overlayLight: 'rgba(0, 0, 0, 0.15)',

  gradientPrimary: ['#C4708A', '#A35570'] as const,
  gradientPink: ['#C4708A', '#A35570'] as const,
  gradientDark: ['#F8F6F3', '#FFFFFF'] as const,
  gradientCard: ['rgba(255, 255, 255, 0.9)', 'rgba(248, 246, 243, 0.7)'] as const,

  vault: '#A08930',
  vaultMuted: 'rgba(160, 137, 48, 0.08)',
  vaultBorder: 'rgba(160, 137, 48, 0.2)',
  vaultGradientStart: 'rgba(160, 137, 48, 0.12)',
  vaultGradientEnd: 'rgba(160, 137, 48, 0.03)',

  sosBannerStart: 'rgba(192, 57, 43, 0.12)',
  sosBannerEnd: 'rgba(142, 68, 173, 0.08)',
  sosBannerBorder: 'rgba(192, 57, 43, 0.15)',
  sosHighlightBg: 'rgba(192, 57, 43, 0.08)',
  sosHighlightBorder: 'rgba(192, 57, 43, 0.12)',
};

// LinkHer Dark (iOS)
const LinkHerDark = {
  background: '#0D0B1A',
  surface: '#1A1730',
  surfaceLight: '#1A1730',
  surfaceDark: '#0A0815',
  surfaceHover: '#241F40',

  coral: '#E84393',
  coralLight: '#F06AB0',
  coralDark: '#C850C0',
  coralMuted: 'rgba(232, 67, 147, 0.15)',
  pink: '#E84393',
  pinkMuted: 'rgba(232, 67, 147, 0.15)',
  pinkGlow: 'rgba(232, 67, 147, 0.18)',
  purple: '#A855F7',
  purpleMuted: 'rgba(168, 85, 247, 0.15)',

  textPrimary: '#FFFFFF',
  textSecondary: '#E0D5F0',
  textMuted: '#7B6F8E',
  textInverse: '#0D0B1A',

  success: '#2ecc71',
  successMuted: 'rgba(46, 204, 113, 0.15)',
  warning: '#f1c40f',
  warningMuted: 'rgba(241, 196, 15, 0.15)',
  danger: '#e74c3c',
  dangerMuted: 'rgba(231, 76, 60, 0.15)',
  info: '#3498db',
  infoMuted: 'rgba(52, 152, 219, 0.15)',

  trustVerified: '#2ecc71',
  trustPending: '#f1c40f',
  trustNew: '#7B6F8E',

  border: 'rgba(255, 255, 255, 0.06)',
  borderLight: 'rgba(255, 255, 255, 0.12)',
  borderFocus: '#E84393',

  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',

  gradientPrimary: ['#E84393', '#C850C0'] as const,
  gradientPink: ['#E84393', '#A855F7'] as const,
  gradientDark: ['#0D0B1A', '#1A1730'] as const,
  gradientCard: ['rgba(26, 23, 48, 0.8)', 'rgba(13, 11, 26, 0.6)'] as const,

  vault: '#C9A84C',
  vaultMuted: 'rgba(201, 168, 76, 0.12)',
  vaultBorder: 'rgba(201, 168, 76, 0.2)',
  vaultGradientStart: 'rgba(201, 168, 76, 0.18)',
  vaultGradientEnd: 'rgba(201, 168, 76, 0.05)',

  sosBannerStart: 'rgba(232, 67, 147, 0.25)',
  sosBannerEnd: 'rgba(168, 85, 247, 0.18)',
  sosBannerBorder: 'rgba(232, 67, 147, 0.2)',
  sosHighlightBg: 'rgba(232, 67, 147, 0.12)',
  sosHighlightBorder: 'rgba(232, 67, 147, 0.18)',
};

// LinkHer Light (iOS)
const LinkHerLight = {
  background: '#FAF7FC',
  surface: '#FFFFFF',
  surfaceLight: '#FFFFFF',
  surfaceDark: '#F0EAF5',
  surfaceHover: '#F5EFF8',

  coral: '#C0297A',
  coralLight: '#E84393',
  coralDark: '#9C2A99',
  coralMuted: 'rgba(192, 41, 122, 0.10)',
  pink: '#C0297A',
  pinkMuted: 'rgba(192, 41, 122, 0.10)',
  pinkGlow: 'rgba(192, 41, 122, 0.08)',
  purple: '#8B3FD9',
  purpleMuted: 'rgba(139, 63, 217, 0.10)',

  textPrimary: '#1A1730',
  textSecondary: '#3D2F4F',
  textMuted: '#7B6F8E',
  textInverse: '#FFFFFF',

  success: '#27AE60',
  successMuted: 'rgba(39, 174, 96, 0.10)',
  warning: '#D4A017',
  warningMuted: 'rgba(212, 160, 23, 0.10)',
  danger: '#C0392B',
  dangerMuted: 'rgba(192, 57, 43, 0.10)',
  info: '#2980B9',
  infoMuted: 'rgba(41, 128, 185, 0.10)',

  trustVerified: '#27AE60',
  trustPending: '#D4A017',
  trustNew: '#7B6F8E',

  border: 'rgba(0, 0, 0, 0.08)',
  borderLight: 'rgba(0, 0, 0, 0.05)',
  borderFocus: '#C0297A',

  overlay: 'rgba(0, 0, 0, 0.3)',
  overlayLight: 'rgba(0, 0, 0, 0.15)',

  gradientPrimary: ['#C0297A', '#9C2A99'] as const,
  gradientPink: ['#C0297A', '#8B3FD9'] as const,
  gradientDark: ['#FAF7FC', '#FFFFFF'] as const,
  gradientCard: ['rgba(255, 255, 255, 0.9)', 'rgba(250, 247, 252, 0.7)'] as const,

  vault: '#A08930',
  vaultMuted: 'rgba(160, 137, 48, 0.08)',
  vaultBorder: 'rgba(160, 137, 48, 0.2)',
  vaultGradientStart: 'rgba(160, 137, 48, 0.12)',
  vaultGradientEnd: 'rgba(160, 137, 48, 0.03)',

  sosBannerStart: 'rgba(192, 41, 122, 0.12)',
  sosBannerEnd: 'rgba(139, 63, 217, 0.08)',
  sosBannerBorder: 'rgba(192, 41, 122, 0.15)',
  sosHighlightBg: 'rgba(192, 41, 122, 0.08)',
  sosHighlightBorder: 'rgba(192, 41, 122, 0.12)',
};

export const DarkColors = isIOS ? LinkHerDark : SafeTeaDark;
export const LightColors = isIOS ? LinkHerLight : SafeTeaLight;
export const Colors = DarkColors;

export const APP_NAME = isIOS ? 'LinkHer' : 'SafeTea';
export const APP_NAME_PLUS = isIOS ? 'LinkHer+' : 'SafeTea+';
export const APP_TAGLINE = isIOS ? 'Stay Connected. Stay Safe.' : 'Personal Safety';

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
