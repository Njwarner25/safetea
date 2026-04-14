import { create } from 'zustand';

export type CheckInStatus = 'pending' | 'safe' | 'missed' | 'panic';

export interface TrustedContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
}

export interface CheckIn {
  id: string;
  sessionId: string;
  time: string;
  status: CheckInStatus;
}

export interface DateSession {
  id: string;
  venue: string;
  partnerName: string;
  startTime: string;
  endTime?: string;
  trustedContactId: string;
  status: 'active' | 'completed' | 'panic';
  checkIns: CheckIn[];
}

interface SafeWalkState {
  trustedContacts: TrustedContact[];
  activeSession: DateSession | null;
  pastSessions: DateSession[];
  sosActive: boolean;

  addContact: (contact: TrustedContact) => void;
  removeContact: (id: string) => void;
  startSession: (session: DateSession) => void;
  endSession: () => void;
  triggerPanic: () => void;
  triggerSOS: (type: string) => void;
  addCheckIn: (checkIn: CheckIn) => void;
  respondToCheckIn: (checkInId: string, status: CheckInStatus) => void;
}

export const useSafeWalkStore = create<SafeWalkState>((set, get) => ({
  trustedContacts: [],
  activeSession: null,
  pastSessions: [],
  sosActive: false,

  addContact: (contact) => set((state) => ({
    trustedContacts: [...state.trustedContacts, contact],
  })),

  removeContact: (id) => set((state) => ({
    trustedContacts: state.trustedContacts.filter(c => c.id !== id),
  })),

  startSession: (session) => set({ activeSession: session }),

  addCheckIn: (checkIn) => set((state) => {
    if (!state.activeSession) return state;
    return {
      activeSession: {
        ...state.activeSession,
        checkIns: [...state.activeSession.checkIns, checkIn],
      },
    };
  }),

  endSession: () => set((state) => {
    if (!state.activeSession) return state;
    const completed = {
      ...state.activeSession,
      status: 'completed' as const,
      endTime: new Date().toISOString(),
    };
    return {
      activeSession: null,
      pastSessions: [completed, ...state.pastSessions],
    };
  }),

  triggerPanic: () => set((state) => {
    if (!state.activeSession) return state;
    return {
      sosActive: true,
      activeSession: {
        ...state.activeSession,
        status: 'panic',
      },
    };
  }),

  triggerSOS: (type: string) => set((state) => {
    if (!state.activeSession) return state;
    return {
      sosActive: true,
      activeSession: {
        ...state.activeSession,
        status: 'panic',
      },
    };
  }),

  respondToCheckIn: (checkInId, status) => set((state) => {
    if (!state.activeSession) return state;
    return {
      activeSession: {
        ...state.activeSession,
        checkIns: state.activeSession.checkIns.map(ci =>
          ci.id === checkInId ? { ...ci, status } : ci
        ),
      },
    };
  }),
}));
