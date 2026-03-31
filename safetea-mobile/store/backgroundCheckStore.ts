import { create } from 'zustand';

export interface BgCheckResult {
  id: string;
  subject: string;
  location: string;
  searchedAt: string;
  riskScore: number;
  riskLevel: string;
  riskFlags: string[];
  sections: Record<string, any>;
}

interface BackgroundCheckState {
  bgResult: BgCheckResult | null;
  bgLoading: boolean;
  bgError: string | null;
  bgHistory: BgCheckResult[];

  setBgResult: (result: BgCheckResult) => void;
  setBgLoading: (loading: boolean) => void;
  setBgError: (error: string | null) => void;
  clearBgResult: () => void;
}

export const useBackgroundCheckStore = create<BackgroundCheckState>((set) => ({
  bgResult: null,
  bgLoading: false,
  bgError: null,
  bgHistory: [],

  setBgResult: (result) => set((state) => ({
    bgResult: result,
    bgLoading: false,
    bgError: null,
    bgHistory: [result, ...state.bgHistory],
  })),

  setBgLoading: (loading) => set({ bgLoading: loading, bgError: null }),

  setBgError: (error) => set({ bgError: error, bgLoading: false }),

  clearBgResult: () => set({ bgResult: null, bgError: null }),
}));
