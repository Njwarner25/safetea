import { create } from 'zustand';

export type ScamCategory = 'catfish' | 'romance_fraud' | 'sextortion' | 'identity_theft' | 'crypto_scam' | 'other';

export interface ScamEntry {
  id: string;
  title: string;
  category: ScamCategory;
  description: string;
  reportCount: number;
  platforms: string[];
  reportedAt: string;
}

interface ScamState {
  entries: ScamEntry[];
  searchQuery: string;
  selectedCategory: ScamCategory | 'all';
  isLoading: boolean;

  setSearchQuery: (q: string) => void;
  setCategory: (cat: ScamCategory | 'all') => void;
  getFilteredEntries: () => ScamEntry[];
  fetchEntries: () => Promise<void>;
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.getsafetea.app';

export const useScamStore = create<ScamState>((set, get) => ({
  entries: [],
  searchQuery: '',
  selectedCategory: 'all',
  isLoading: false,

  setSearchQuery: (q) => set({ searchQuery: q }),

  setCategory: (cat) => set({ selectedCategory: cat }),

  getFilteredEntries: () => {
    const { entries, searchQuery, selectedCategory } = get();
    let filtered = selectedCategory === 'all'
      ? entries
      : entries.filter(e => e.category === selectedCategory);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.title.toLowerCase().includes(query) ||
        e.description.toLowerCase().includes(query) ||
        e.platforms.some(p => p.toLowerCase().includes(query))
      );
    }

    return filtered;
  },

  fetchEntries: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch(API_BASE + '/blog/news');
      const data = await res.json();
      if (Array.isArray(data)) {
        const mapped: ScamEntry[] = data
          .filter((item: any) => item.category || item.title)
          .map((item: any, i: number) => ({
            id: item.id || 'scam-' + i,
            title: item.title || 'Unknown Scam',
            category: item.category || 'other',
            description: item.description || item.snippet || '',
            reportCount: item.reportCount || 0,
            platforms: item.platforms || [],
            reportedAt: item.reportedAt || item.date || new Date().toISOString(),
          }));
        set({ entries: mapped });
      }
    } catch {
      // API unavailable — entries remain empty
    } finally {
      set({ isLoading: false });
    }
  },
}));
