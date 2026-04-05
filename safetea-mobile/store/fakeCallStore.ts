import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type VoicePersona = 'mom' | 'bestfriend' | 'sister' | 'dad' | 'roommate';
export type CallStyle = 'ios' | 'android';

export const VOICE_PERSONAS: { id: VoicePersona; label: string; desc: string }[] = [
  { id: 'mom', label: 'Mom', desc: 'Warm, caring, relatable mom voice' },
  { id: 'bestfriend', label: 'Best Friend', desc: 'Bubbly, gossipy bestie energy' },
  { id: 'sister', label: 'Older Sister', desc: 'Confident, playful, articulate' },
  { id: 'dad', label: 'Dad', desc: 'Grounded, fatherly, trustworthy' },
  { id: 'roommate', label: 'Roommate', desc: 'Relaxed, chatty, friendly' },
];

interface FakeCallStore {
  callerName: string;
  callerPhoto: string | null;
  voicePersona: VoicePersona;
  ringtone: string;
  delaySeconds: number;
  scriptContext: string;
  callStyle: CallStyle;
  setCallerName: (name: string) => void;
  setCallerPhoto: (photo: string | null) => void;
  setVoicePersona: (persona: VoicePersona) => void;
  setRingtone: (ringtone: string) => void;
  setDelaySeconds: (s: number) => void;
  setScriptContext: (ctx: string) => void;
  setCallStyle: (style: CallStyle) => void;
}

export const useFakeCallStore = create<FakeCallStore>()(
  persist(
    (set) => ({
      callerName: 'Mom',
      callerPhoto: null,
      voicePersona: 'mom',
      ringtone: 'default',
      delaySeconds: 15,
      scriptContext: '',
      callStyle: 'ios',

      setCallerName: (callerName) => set({ callerName }),
      setCallerPhoto: (callerPhoto) => set({ callerPhoto }),
      setVoicePersona: (voicePersona) => set({ voicePersona }),
      setRingtone: (ringtone) => set({ ringtone }),
      setDelaySeconds: (delaySeconds) => set({ delaySeconds }),
      setScriptContext: (scriptContext) => set({ scriptContext }),
      setCallStyle: (callStyle) => set({ callStyle }),
    }),
    {
      name: 'safetea-fake-call',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
