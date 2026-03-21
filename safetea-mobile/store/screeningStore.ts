import { create } from 'zustand';

export type TeaScoreLevel = 'safe' | 'caution' | 'warning' | 'danger';

export interface RedFlag {
  id: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface GreenFlag {
  id: string;
  label: string;
  description: string;
}

export interface ScreeningResult {
  id: string;
  profileName: string;
  platform: string;
  teaScore: number;
  teaScoreLevel: TeaScoreLevel;
  redFlags: RedFlag[];
  greenFlags: GreenFlag[];
  scannedAt: string;
}

interface ScreeningState {
  history: ScreeningResult[];
  currentScan: ScreeningResult | null;
  isScanning: boolean;

  startScan: (profileName: string, platform: string) => void;
  completeScan: (result: ScreeningResult) => void;
  clearCurrentScan: () => void;
  removeFromHistory: (id: string) => void;
}

export const useScreeningStore = create<ScreeningState>((set, get) => ({
  history: [],
  currentScan: null,
  isScanning: false,

  startScan: (profileName, platform) => set({
    isScanning: true,
    currentScan: null,
  }),

  completeScan: (result) => set((state) => ({
    isScanning: false,
    currentScan: result,
    history: [result, ...state.history],
  })),

  clearCurrentScan: () => set({ currentScan: null, isScanning: false }),

  removeFromHistory: (id) => set((state) => ({
    history: state.history.filter(r => r.id !== id),
  })),
}));
