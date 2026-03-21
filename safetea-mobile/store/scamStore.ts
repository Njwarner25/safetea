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

  setSearchQuery: (q: string) => void;
  setCategory: (cat: ScamCategory | 'all') => void;
  getFilteredEntries: () => ScamEntry[];
}

const DEFAULT_ENTRIES: ScamEntry[] = [
  {
    id: 'scam-1',
    title: 'Military Romance Scam',
    category: 'romance_fraud',
    description: 'Claims to be deployed military officer. Asks for money for "leave papers" or "shipping personal items." Uses stolen photos from real service members.',
    reportCount: 847,
    platforms: ['Tinder', 'Facebook Dating'],
    reportedAt: '2026-03-15',
  },
  {
    id: 'scam-2',
    title: 'Crypto Investment Lure',
    category: 'crypto_scam',
    description: 'Matches on dating apps, builds relationship, then introduces "amazing crypto investment opportunity." Often uses fake trading platforms.',
    reportCount: 623,
    platforms: ['Hinge', 'Bumble'],
    reportedAt: '2026-03-12',
  },
  {
    id: 'scam-3',
    title: 'Stolen Photo Catfish',
    category: 'catfish',
    description: 'Uses photos stolen from Instagram influencers or models. Refuses video calls. Reverse image search reveals the real person.',
    reportCount: 1204,
    platforms: ['Tinder', 'Hinge', 'Bumble'],
    reportedAt: '2026-03-10',
  },
  {
    id: 'scam-4',
    title: 'Intimate Image Extortion',
    category: 'sextortion',
    description: 'Quickly escalates to exchanging intimate photos, then threatens to share them with contacts unless paid. Often targets through dating apps.',
    reportCount: 512,
    platforms: ['Snapchat', 'Instagram'],
    reportedAt: '2026-03-08',
  },
  {
    id: 'scam-5',
    title: 'Identity Verification Phish',
    category: 'identity_theft',
    description: 'Sends a link to a fake "dating safety verification" site that harvests personal information including SSN and credit card details.',
    reportCount: 389,
    platforms: ['Tinder', 'OkCupid'],
    reportedAt: '2026-03-05',
  },
];

export const useScamStore = create<ScamState>((set, get) => ({
  entries: DEFAULT_ENTRIES,
  searchQuery: '',
  selectedCategory: 'all',

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
}));
