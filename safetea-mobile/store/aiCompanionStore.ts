import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AlessiaStyleId,
  VoiceTone,
  PersonalityTone,
  SKIN_TONES,
  HAIR_COLORS,
  EYE_COLORS,
  HAIRSTYLES,
  OUTFIT_STYLES,
} from '../constants/companion';

interface AlessiaCustomization {
  styleId: AlessiaStyleId;
  skinTone: string;
  hairstyle: string;
  hairColor: string;
  eyeColor: string;
  outfit: string;
  voiceTone: VoiceTone;
  personality: PersonalityTone;
}

interface AlessiaStore extends AlessiaCustomization {
  onboarded: boolean;
  setStyle: (id: AlessiaStyleId) => void;
  setSkinTone: (c: string) => void;
  setHairstyle: (h: string) => void;
  setHairColor: (c: string) => void;
  setEyeColor: (c: string) => void;
  setOutfit: (o: string) => void;
  setVoiceTone: (v: VoiceTone) => void;
  setPersonality: (p: PersonalityTone) => void;
  applyDefaults: () => void;
  completeOnboarding: () => void;
  reset: () => void;
}

const DEFAULTS: AlessiaCustomization & { onboarded: boolean } = {
  onboarded: false,
  styleId: 'warm-human',
  skinTone: SKIN_TONES[1],
  hairstyle: HAIRSTYLES[0],
  hairColor: HAIR_COLORS[0],
  eyeColor: EYE_COLORS[0],
  outfit: OUTFIT_STYLES[0],
  voiceTone: 'calm',
  personality: 'protective',
};

export const useAiCompanionStore = create<AlessiaStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setStyle: (styleId) => set({ styleId }),
      setSkinTone: (skinTone) => set({ skinTone }),
      setHairstyle: (hairstyle) => set({ hairstyle }),
      setHairColor: (hairColor) => set({ hairColor }),
      setEyeColor: (eyeColor) => set({ eyeColor }),
      setOutfit: (outfit) => set({ outfit }),
      setVoiceTone: (voiceTone) => set({ voiceTone }),
      setPersonality: (personality) => set({ personality }),
      applyDefaults: () => set({ ...DEFAULTS, onboarded: true }),
      completeOnboarding: () => set({ onboarded: true }),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'safetea-companion',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
