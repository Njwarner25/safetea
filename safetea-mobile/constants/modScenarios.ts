export type ModAction = 'approve' | 'reject' | 'escalate' | 'warn' | 'ban';

export interface ModScenario {
  id: string;
  title: string;
  description: string;
  correctAction: ModAction;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export const MOD_APPLICATION_SCENARIOS: ModScenario[] = [
  {
    id: 'sc1',
    title: 'Identifying Doxxing',
    description: 'A user posts: "I found out where [person] lives, their address is..."',
    correctAction: 'reject',
    explanation: 'This is doxxing - sharing personal information without consent. Remove immediately and issue a ban.',
    difficulty: 'easy',
  },
  {
    id: 'sc2',
    title: 'Ambiguous Warning',
    description: 'A user posts: "Be careful with [name], they gave me weird vibes at the bar last night. Nothing happened but just a heads up."',
    correctAction: 'approve',
    explanation: 'This is a legitimate safety concern shared without personal info. Vague but within community guidelines.',
    difficulty: 'medium',
  },
  {
    id: 'sc3',
    title: 'Revenge Posting',
    description: 'A user posts: "[Name] cheated on me with my best friend, here are their social media accounts and workplace info."',
    correctAction: 'reject',
    explanation: 'This appears motivated by revenge rather than safety. Contains personal/identifying details that could enable harassment.',
    difficulty: 'medium',
  },
  {
    id: 'sc4',
    title: 'Legitimate Safety Alert',
    description: 'A user posts: "Warning: I went on a date with someone from [app] who became aggressive when I tried to leave. No names but be careful meeting people at [location]."',
    correctAction: 'approve',
    explanation: 'Legitimate safety warning without identifying personal information. Warns community without targeting an individual.',
    difficulty: 'easy',
  },
  {
    id: 'sc5',
    title: 'Criminal Record Sharing',
    description: 'A user posts a screenshot of public court records showing a conviction, with the person\'s full name and photo.',
    correctAction: 'escalate',
    explanation: 'While court records are public, sharing them requires FCRA compliance review. Escalate to senior moderator for legal review.',
    difficulty: 'hard',
  },
];

export const PASSING_SCORE = 0.8;

export const getScenariosByDifficulty = (difficulty: ModScenario['difficulty']) =>
  MOD_APPLICATION_SCENARIOS.filter(s => s.difficulty === difficulty);
