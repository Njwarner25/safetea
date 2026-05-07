import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CompanionAvatar = 'soft_guardian' | 'shield' | 'heart_link' | 'moon_safety' | 'minimal_icon';
export type CompanionTheme  = 'safetea_coral' | 'rose_gold' | 'midnight' | 'soft_lavender';
export type CompanionTone   = 'calm' | 'gentle' | 'encouraging' | 'direct';

export interface CompanionAvatarOption {
  id: CompanionAvatar;
  label: string;
  icon: string;
  desc: string;
}

export interface CompanionThemeOption {
  id: CompanionTheme;
  label: string;
  primary: string;
  secondary: string;
}

export interface CompanionToneOption {
  id: CompanionTone;
  label: string;
  desc: string;
}

export const COMPANION_AVATARS: CompanionAvatarOption[] = [
  { id: 'soft_guardian', label: 'Soft Guardian', icon: 'user-shield', desc: 'A quiet, watchful presence.' },
  { id: 'shield',         label: 'Shield',        icon: 'shield-alt',  desc: 'Protective and steady.' },
  { id: 'heart_link',     label: 'Heart',         icon: 'heart',       desc: 'Warm and grounding.' },
  { id: 'moon_safety',    label: 'Moon',          icon: 'moon',        desc: 'Calm in the dark.' },
  { id: 'minimal_icon',   label: 'Minimal',       icon: 'circle',      desc: 'Clean, low-key.' },
];

export const COMPANION_THEMES: CompanionThemeOption[] = [
  { id: 'safetea_coral',  label: 'SafeTea Coral', primary: '#E8A0B5', secondary: '#D4768E' },
  { id: 'rose_gold',      label: 'Rose Gold',     primary: '#E0B0A0', secondary: '#C68B7A' },
  { id: 'midnight',       label: 'Midnight',      primary: '#7B89E8', secondary: '#5C6BC0' },
  { id: 'soft_lavender',  label: 'Soft Lavender', primary: '#B8A6E8', secondary: '#9B7EDC' },
];

export const COMPANION_TONES: CompanionToneOption[] = [
  { id: 'calm',         label: 'Calm',         desc: 'Even, steady, low-volume.' },
  { id: 'gentle',       label: 'Gentle',       desc: 'Warm and validating.' },
  { id: 'encouraging',  label: 'Encouraging',  desc: 'Hopeful and supportive.' },
  { id: 'direct',       label: 'Direct',       desc: 'Plain, concrete, no filler.' },
];

export const COMPANION_NAME_SUGGESTIONS = ['Ava', 'Luna', 'Sage', 'Haven', 'Nova', 'Ally'];

interface AiCompanionState {
  // null until the user finishes onboarding (then mirrored from server).
  companionName: string | null;
  avatar: CompanionAvatar;
  theme: CompanionTheme;
  tone: CompanionTone;
  // Hydration flag — true once we've checked the server for existing settings.
  hydrated: boolean;

  setCompanionName: (name: string) => void;
  setAvatar: (a: CompanionAvatar) => void;
  setTheme: (t: CompanionTheme) => void;
  setTone: (t: CompanionTone) => void;
  applyServerSettings: (s: { companion_name: string; avatar_style: CompanionAvatar; theme_color: CompanionTheme; tone: CompanionTone } | null) => void;
  reset: () => void;
}

export const useAiCompanionStore = create<AiCompanionState>()(
  persist(
    (set) => ({
      companionName: null,
      avatar: 'soft_guardian',
      theme: 'safetea_coral',
      tone: 'gentle',
      hydrated: false,

      setCompanionName: (name) => set({ companionName: name.trim().slice(0, 40) }),
      setAvatar: (a) => set({ avatar: a }),
      setTheme: (t) => set({ theme: t }),
      setTone: (t) => set({ tone: t }),

      applyServerSettings: (s) => {
        if (!s) {
          set({ hydrated: true });
          return;
        }
        set({
          companionName: s.companion_name,
          avatar: s.avatar_style,
          theme: s.theme_color,
          tone: s.tone,
          hydrated: true,
        });
      },

      reset: () => set({
        companionName: null,
        avatar: 'soft_guardian',
        theme: 'safetea_coral',
        tone: 'gentle',
        hydrated: false,
      }),
    }),
    {
      name: 'ai-companion-settings-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        companionName: state.companionName,
        avatar: state.avatar,
        theme: state.theme,
        tone: state.tone,
      }),
    }
  )
);

export function getThemeById(id: CompanionTheme): CompanionThemeOption {
  return COMPANION_THEMES.find((t) => t.id === id) || COMPANION_THEMES[0];
}

export function getAvatarById(id: CompanionAvatar): CompanionAvatarOption {
  return COMPANION_AVATARS.find((a) => a.id === id) || COMPANION_AVATARS[0];
}
