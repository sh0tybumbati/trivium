export type Phase = 'idle' | 'lobby' | 'ready' | 'question' | 'locked' | 'reveal' | 'roundEnd' | 'finished';
export type QuestionType = 'multiple_choice' | 'write_in';
export type Mode = 'individual' | 'teams';

export interface PlayerRow {
  id: string;
  name: string;
  teamId: string | null;
  connected: boolean;
  score: number;
  rank: number;
}

export interface TeamRow {
  id: string;
  name: string;
  color: string;
  members: number;
  score: number;
  rank: number;
}

export interface QuestionView {
  id: number;
  type: QuestionType;
  category: string;
  text: string;
  options: string[];
  imageUrl: string;
  /** Only present at reveal (and always for the host). */
  answer?: string;
  explanation?: string;
}

export interface ResultRow {
  playerId: string;
  name: string;
  answer: string;
  credit: number;
  points: number;
  joker: boolean;
}

export interface SubmissionRow {
  playerId: string;
  name: string;
  answer: string;
  joker: boolean;
  responseMs: number;
  credit: number | null;
  points: number | null;
}

export interface Me {
  id: string;
  name: string;
  teamId: string | null;
  score: number;
  rank: number;
  jokerSpent: boolean;
  jokerArmed: boolean;
  answer: string | null;
  result: { credit: number; points: number; joker: boolean } | null;
}

export interface GameConfig {
  title: string;
  subtitle: string;
  mode: Mode;
  teamCount: number;
  teamAssign: 'choose' | 'auto';
  teamScoring: 'average' | 'sum';
  categories: string[];
  questionCount: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  roundMode: 'single' | 'size' | 'category';
  roundSize: number;
  pointsPerQuestion: number;
  timed: boolean;
  timeLimit: number;
  speedBonus: boolean;
  jokers: boolean;
  audio: boolean;
  showCounter: boolean;
}

export interface RosterRow {
  id: string;
  name: string;
  teamId: string | null;
  connected: boolean;
  jokerSpent: boolean;
}

export interface GameView {
  phase: Phase;
  serverNow: number;
  title?: string;
  subtitle?: string;
  mode?: Mode;
  joinCode?: string;
  options?: {
    timed: boolean; speedBonus: boolean; jokers: boolean; audio: boolean; showCounter: boolean;
    teamAssign: 'choose' | 'auto'; teamScoring: 'average' | 'sum'; points: number;
  };
  showLeaderboard?: boolean;
  players?: PlayerRow[];
  teams?: TeamRow[];
  rounds?: { name: string; questions: number }[];
  roundIndex?: number;
  roundName?: string;
  questionIndex?: number;
  questionNumber?: number;
  totalQuestions?: number;
  question?: QuestionView;
  timer?: { durationMs: number; endsAt: number | null };
  answeredCount?: number;
  connectedCount?: number;
  optionCounts?: Record<string, number>;
  results?: ResultRow[];
  submissions?: SubmissionRow[];
  config?: GameConfig;
  roster?: RosterRow[];
  savedGameId?: number | null;
  me?: Me;
}

export interface QuestionRecord {
  id: number;
  category: string;
  type: QuestionType;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  imageUrl: string;
  stats?: { answers: number; correct: number };
}

export interface GameSummary {
  id: number;
  title: string;
  mode: Mode;
  status: string;
  started_at: string;
  ended_at: string;
  players: number;
}

export interface GameDetail extends Omit<GameSummary, 'players'> {
  config: GameConfig;
  players: { player_id: string; name: string; team: string; score: number; rank: number }[];
}

export interface SetupInfo {
  defaults: GameConfig;
  last: GameConfig | null;
  categories: { category: string; count: number }[];
  questionCount: number;
  hasPin: boolean;
  pinFromEnv: boolean;
}

export interface ServerInfo {
  phase: Phase;
  title: string;
  codeRequired: boolean;
  hasPin: boolean;
  local: boolean;
  publicUrl: string | null;
  urls: string[];
}
