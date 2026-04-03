import { create } from 'zustand';
import { useNameWatchStore } from './nameWatchStore';

export type PostCategory = 'warning' | 'positive' | 'question' | 'alert';
export type PostStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

export interface Post {
  id: string;
  authorId: string;
  authorPseudonym: string;
  authorAvatarId: string;
  authorTier?: 'free' | 'plus' | 'pro';
  cityId: string;
  category: PostCategory;
  title: string;
  content: string;
  isAnonymous: boolean;
  status: PostStatus;
  upvotes: number;
  downvotes: number;
  commentCount: number;
  createdAt: string;
  moderatedBy?: string;
  moderatedAt?: string;
}

interface PostState {
  posts: Post[];
  loading: boolean;
  error: string | null;
  filter: PostCategory | 'all';
  sortBy: 'newest' | 'popular' | 'discussed';

  setPosts: (posts: Post[]) => void;
  addPost: (post: Post) => void;
  removePost: (id: string) => void;
  updatePost: (id: string, updates: Partial<Post>) => void;
  setFilter: (filter: PostCategory | 'all') => void;
  setSortBy: (sortBy: 'newest' | 'popular' | 'discussed') => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  getFilteredPosts: () => Post[];
}

export const usePostStore = create<PostState>((set, get) => ({
  posts: [],
  loading: false,
  error: null,
  filter: 'all',
  sortBy: 'newest',

  setPosts: (posts) => set({ posts }),
  addPost: (post) => {
    set((state) => ({ posts: [post, ...state.posts] }));
    useNameWatchStore.getState().checkPost(post);
  },
  removePost: (id) => set((state) => ({ posts: state.posts.filter(p => p.id !== id) })),
  updatePost: (id, updates) => set((state) => ({
    posts: state.posts.map(p => p.id === id ? { ...p, ...updates } : p),
  })),
  setFilter: (filter) => set({ filter }),
  setSortBy: (sortBy) => set({ sortBy }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  getFilteredPosts: () => {
    const { posts, filter, sortBy } = get();
    let filtered = filter === 'all' ? posts : posts.filter(p => p.category === filter);
    filtered = filtered.filter(p => p.status === 'approved');

    switch (sortBy) {
      case 'newest':
        return [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case 'popular':
        return [...filtered].sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
      case 'discussed':
        return [...filtered].sort((a, b) => b.commentCount - a.commentCount);
      default:
        return filtered;
    }
  },
}));
