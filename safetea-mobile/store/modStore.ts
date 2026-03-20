import { create } from 'zustand';
import { Post } from './postStore';
import { ModAction } from '../constants/modScenarios';

export type ModApplicationStatus = 'not_applied' | 'scenario_test' | 'community_review' | 'interview' | 'probation' | 'approved' | 'rejected';

export interface ModApplication {
  userId: string;
  status: ModApplicationStatus;
  scenarioScore: number;
  communityVotes: { approve: number; reject: number };
  interviewDate?: string;
  probationStartDate?: string;
  appliedAt: string;
}

export interface ModQueueItem {
  post: Post;
  reportCount: number;
  reportReasons: string[];
  assignedTo?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

interface ModState {
  queue: ModQueueItem[];
  applications: ModApplication[];
  myApplication: ModApplication | null;
  loading: boolean;
  stats: {
    totalReviewed: number;
    approvedToday: number;
    rejectedToday: number;
    avgResponseTime: number;
  };

  setQueue: (queue: ModQueueItem[]) => void;
  moderatePost: (postId: string, action: ModAction, reason: string) => void;
  submitApplication: (userId: string) => void;
  updateApplicationScore: (score: number) => void;
  setLoading: (loading: boolean) => void;
}

export const useModStore = create<ModState>((set, get) => ({
  queue: [],
  applications: [],
  myApplication: null,
  loading: false,
  stats: {
    totalReviewed: 0,
    approvedToday: 0,
    rejectedToday: 0,
    avgResponseTime: 0,
  },

  setQueue: (queue) => set({ queue }),

  moderatePost: (postId, action, reason) => set((state) => ({
    queue: state.queue.filter(item => item.post.id !== postId),
    stats: {
      ...state.stats,
      totalReviewed: state.stats.totalReviewed + 1,
      approvedToday: action === 'approve' ? state.stats.approvedToday + 1 : state.stats.approvedToday,
      rejectedToday: action === 'reject' ? state.stats.rejectedToday + 1 : state.stats.rejectedToday,
    },
  })),

  submitApplication: (userId) => set({
    myApplication: {
      userId,
      status: 'scenario_test',
      scenarioScore: 0,
      communityVotes: { approve: 0, reject: 0 },
      appliedAt: new Date().toISOString(),
    },
  }),

  updateApplicationScore: (score) => set((state) => ({
    myApplication: state.myApplication
      ? { ...state.myApplication, scenarioScore: score }
      : null,
  })),

  setLoading: (loading) => set({ loading }),
}));
