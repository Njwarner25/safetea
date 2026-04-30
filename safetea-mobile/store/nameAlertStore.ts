import { create } from 'zustand';
import { Post } from './postStore';
import { NameAlertEntry, NameAlertMatch, matchPost } from '../utils/nameAlertMatcher';

export type { NameAlertEntry, NameAlertMatch } from '../utils/nameAlertMatcher';

interface NameAlertState {
  watchedNames: NameAlertEntry[];
  matches: NameAlertMatch[];
  loading: boolean;

  addEntry: (name: string, searchTerms: string[], cityIds?: string[]) => void;
  removeEntry: (id: string) => void;
  editEntry: (id: string, updates: Partial<Pick<NameAlertEntry, 'displayName' | 'searchTerms' | 'cityIds'>>) => void;
  checkPost: (post: Post) => void;
  markMatchRead: (id: string) => void;
  getUnreadCount: () => number;
  getMatchesForEntry: (entryId: string) => NameAlertMatch[];
}

export const useNameAlertStore = create<NameAlertState>((set, get) => ({
  watchedNames: [],
  matches: [],
  loading: false,

  addEntry: (name, searchTerms, cityIds = []) => {
    const entry: NameAlertEntry = {
      id: `nw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: '', // set by caller context
      displayName: name,
      searchTerms,
      cityIds,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ watchedNames: [entry, ...state.watchedNames] }));
  },

  removeEntry: (id) => set((state) => ({
    watchedNames: state.watchedNames.filter((e) => e.id !== id),
    matches: state.matches.filter((m) => m.entryId !== id),
  })),

  editEntry: (id, updates) => set((state) => ({
    watchedNames: state.watchedNames.map((e) =>
      e.id === id ? { ...e, ...updates } : e,
    ),
  })),

  checkPost: (post) => {
    const { watchedNames, matches } = get();
    const newMatches = matchPost(post, watchedNames);
    if (newMatches.length > 0) {
      set({ matches: [...newMatches, ...matches] });
    }
  },

  markMatchRead: (id) => set((state) => ({
    matches: state.matches.map((m) =>
      m.id === id ? { ...m, isRead: true } : m,
    ),
  })),

  getUnreadCount: () => {
    return get().matches.filter((m) => !m.isRead).length;
  },

  getMatchesForEntry: (entryId) => {
    return get().matches.filter((m) => m.entryId === entryId);
  },
}));
