// Alessia AI Companion — design tokens and option lists.
// Kept separate from the main SafeTea palette so the Alessia flow has its own
// warmer coral / peach / rose accents without affecting the rest of the app.

export const AlessiaColors = {
  bg: '#090912',
  bgAlt: '#120B14',
  card: 'rgba(255,255,255,0.06)',
  cardElevated: 'rgba(255,255,255,0.10)',
  border: 'rgba(255,140,130,0.35)',
  borderMuted: 'rgba(255,255,255,0.10)',
  coral: '#FF6B6B',
  peach: '#FF9A76',
  rose: '#FF4F8B',
  white: '#FFFFFF',
  muted: '#B8AEB8',
  successCheck: '#FF9A76',
};

export const AlessiaGradient = ['#FF6B6B', '#FF9A76'] as const;
export const AlessiaGradientWide = ['#FF4F8B', '#FF6B6B', '#FF9A76'] as const;

export type AlessiaStyleId =
  | 'futuristic'
  | 'warm-human'
  | 'guardian'
  | 'professional'
  | 'soft-anime'
  | 'minimal-android';

export interface AlessiaStyleOption {
  id: AlessiaStyleId;
  label: string;
  icon: string; // FontAwesome5 icon name
  blurb: string;
}

export const ALESSIA_STYLES: AlessiaStyleOption[] = [
  { id: 'futuristic', label: 'Futuristic', icon: 'rocket', blurb: 'Sleek, modern, sci-fi protector.' },
  { id: 'warm-human', label: 'Warm Human', icon: 'heart', blurb: 'Friendly, approachable, human.' },
  { id: 'guardian', label: 'Guardian', icon: 'user-shield', blurb: 'Calm, watchful, protective.' },
  { id: 'professional', label: 'Professional', icon: 'briefcase', blurb: 'Confident, focused, composed.' },
  { id: 'soft-anime', label: 'Soft Anime', icon: 'star', blurb: 'Gentle, illustrated style.' },
  { id: 'minimal-android', label: 'Minimal Android', icon: 'robot', blurb: 'Pure AI, no human form.' },
];

export const SKIN_TONES = ['#F4D7C0', '#E8B894', '#C68A65', '#8E5A3A', '#5A3520'];

export const HAIR_COLORS = [
  '#3B2218', '#6E3B22', '#A65A2E', '#D9A04D', '#F2D7A1', '#8A8A8A', '#2D6BB1',
];

export const EYE_COLORS = [
  '#5C8DBC', '#3E7B5C', '#7A5A36', '#3A2A1E', '#7D6E91', '#2C4B6E',
];

export const HAIRSTYLES = ['Long Wavy', 'Straight', 'Curly', 'Pixie', 'Ponytail', 'Braids'];

export const OUTFIT_STYLES = ['Hoodie', 'Blazer', 'Tee', 'Streetwear', 'Casual', 'Athletic'];

export type VoiceTone = 'calm' | 'direct' | 'encouraging' | 'protective' | 'gentle';
export const VOICE_TONES: { id: VoiceTone; label: string }[] = [
  { id: 'calm', label: 'Calm & Soothing' },
  { id: 'direct', label: 'Direct & Clear' },
  { id: 'encouraging', label: 'Encouraging' },
  { id: 'protective', label: 'Protective' },
  { id: 'gentle', label: 'Gentle' },
];

export type PersonalityTone =
  | 'gentle'
  | 'motivational'
  | 'direct'
  | 'calm'
  | 'protective'
  | 'supportive';
export const PERSONALITY_TONES: { id: PersonalityTone; label: string }[] = [
  { id: 'gentle', label: 'Gentle' },
  { id: 'motivational', label: 'Motivational' },
  { id: 'direct', label: 'Direct' },
  { id: 'calm', label: 'Calm' },
  { id: 'protective', label: 'Protective' },
  { id: 'supportive', label: 'Supportive' },
];

export interface AlessiaFeature {
  id: string;
  icon: string;
  title: string;
  desc: string;
  route?: string;
}

export const ALESSIA_FEATURES: AlessiaFeature[] = [
  { id: 'sos', icon: 'phone-alt', title: 'Emergency Help', desc: 'Get help fast when you need it most.' },
  { id: 'threat', icon: 'exclamation-triangle', title: 'Threat Detection', desc: 'AI alerts you to potential threats.' },
  { id: 'checkin', icon: 'check-circle', title: 'Safe Check-Ins', desc: 'Check in automatically or on your schedule.', route: '/pulse' },
  { id: 'location', icon: 'map-marker-alt', title: 'Location Sharing', desc: 'Share your real-time location with trusted contacts.', route: '/safelink' },
  { id: 'lockwidget', icon: 'lock', title: 'Lock Screen Widget', desc: 'Stay protected right from your lock screen.' },
  { id: 'alerts', icon: 'bell', title: 'Smart Alerts', desc: 'Real-time alerts that keep you informed.' },
  { id: 'quick', icon: 'bolt', title: 'Quick Actions', desc: 'One-tap access to your safety tools.' },
  { id: 'emotional', icon: 'comment-medical', title: 'Emotional Support', desc: 'Talk to Alessia about anything on your mind.' },
  { id: 'daily', icon: 'calendar-day', title: 'Daily Check-In', desc: 'Start your day with a safety check-in.' },
  { id: 'voice', icon: 'microphone', title: 'Voice Chat', desc: 'Talk to Alessia anytime, anywhere.' },
];

export const ALESSIA_DEFAULT_PREVIEW =
  "Hi, I'm Alessia. I'm here to help you feel safe, supported, and never alone.";
