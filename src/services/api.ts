// API service for communicating with the backend server

interface Question {
  id?: number;
  category: string;
  question: string;
  type: 'multiple_choice' | 'write_in' | 'feud';
  options: string[];
  answer: string;
  explanation: string;
  image_url?: string;
  feud_answers?: FeudAnswer[];
}

interface FeudAnswer {
  id?: number;
  answer_text: string;
  points: number;
  display_order: number;
  revealed: boolean;
}

interface Player {
  id: number;
  name: string;
  score: number;
  connected: boolean;
  joined_at: string;
  last_seen: string;
  team_id?: number;
  team?: Team;
}

interface Team {
  id: number;
  name: string;
  color: string;
  score: number;
  member_count: number;
  member_names?: string;
  created_at: string;
}

interface BuzzerResponse {
  id: number;
  player_id: number;
  team_id?: number;
  question_id: number;
  buzz_order: number;
  buzz_time: string;
  player_name?: string;
  team_name?: string;
  team_color?: string;
}

interface GameSettings {
  game_title: string;
  game_subtitle: string;
  show_question_counter: boolean;
  show_wait_screen: boolean;
  timed_rounds: boolean;
  time_limit: number;
  question_limit: number | null;
  selected_categories: string[];
  score_multiplier: number;
  timer_eats_points: boolean;
  min_points_percentage: number;
  hide_qr_during_game: boolean;
  host_password: string;
  auto_clear_players: boolean;
  player_join_timeout: number;
  show_player_count: boolean;
  team_mode: boolean;
  buzzer_enabled: boolean;
  buzzer_timeout: number;
  team_size_limit: number;
}

interface FeudState {
  activeTeam: number | null;
  opposingTeam: number | null;
  gamePhase: 'setup' | 'face-off' | 'team-play' | 'steal';
  teamAnswerCount: number;
  maxAnswersPerTeam: number;
  strikes: number;
  buzzerOrder: number[];
  currentBuzzerIndex: number;
  lastAnswerCorrect: boolean | null;
}

interface GameState {
  gameStarted: boolean;
  firstQuestionStarted: boolean;
  currentSlide: number;
  showAnswer: boolean;
  timer: number;
  isTimerRunning: boolean;
  selectedCategories: string[];
  questionLimit: number | null;
  timeLimit: number;
  timedRounds: boolean;
  gameTitle: string;
  gameSubtitle: string;
  showQuestionCounter: boolean;
  showWaitScreen: boolean;
  playerMode: boolean;
  showLeaderboard: boolean;
  includedQuestions: number[];
  feudState: FeudState;
}

class ApiService {
  private baseUrl: string;

  constructor() {
    // In production (like Render), backend serves frontend from same domain
    // In development, backend runs on port 3001
    const host = window.location.hostname;
    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    
    if (isProduction) {
      // Production: same domain as frontend
      this.baseUrl = `${window.location.protocol}//${window.location.host}/api`;
    } else {
      // Development: backend on port 3001
      this.baseUrl = `${window.location.protocol}//${host}:3001/api`;
    }
  }

  // Questions API
  async getQuestions(): Promise<Question[]> {
    const response = await fetch(`${this.baseUrl}/questions`);
    if (!response.ok) {
      throw new Error('Failed to fetch questions');
    }
    return response.json();
  }

  async addQuestion(question: Omit<Question, 'id'>): Promise<Question> {
    console.log('API: Sending question data:', question);
    const response = await fetch(`${this.baseUrl}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(question),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.log('API Error Response:', errorText);
      throw new Error(`Failed to add question: ${errorText}`);
    }
    return response.json();
  }

  async updateQuestion(id: number, question: Omit<Question, 'id'>): Promise<void> {
    const response = await fetch(`${this.baseUrl}/questions/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(question),
    });
    if (!response.ok) {
      throw new Error('Failed to update question');
    }
  }

  async deleteQuestion(id: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/questions/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete question');
    }
  }

  async exportQuestions(): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/questions/export`);
    if (!response.ok) {
      throw new Error('Failed to export questions');
    }
    return response.blob();
  }

  async importQuestions(questions: Question[], mode: 'replace' | 'append' = 'replace'): Promise<any> {
    const response = await fetch(`${this.baseUrl}/questions/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ questions, mode }),
    });
    if (!response.ok) {
      throw new Error('Failed to import questions');
    }
    return response.json();
  }

  // Game API
  async getGameState(): Promise<GameState> {
    const response = await fetch(`${this.baseUrl}/game/state`);
    if (!response.ok) {
      throw new Error('Failed to fetch game state');
    }
    return response.json();
  }

  async getGameSettings(): Promise<GameSettings> {
    const response = await fetch(`${this.baseUrl}/game/settings`);
    if (!response.ok) {
      throw new Error('Failed to fetch game settings');
    }
    return response.json();
  }

  async updateGameSettings(settings: Partial<GameSettings>): Promise<void> {
    const response = await fetch(`${this.baseUrl}/game/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      throw new Error('Failed to update game settings');
    }
  }

  async validateHostPassword(password: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/game/validate-host-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });
    
    if (response.ok) {
      const result = await response.json();
      return result.valid;
    } else if (response.status === 401) {
      return false; // Invalid password
    } else {
      throw new Error('Failed to validate host password');
    }
  }

  // Game control actions
  async startGame(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/game/start`, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to start game');
    }
  }

  async endGame(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/game/end`, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to end game');
    }
  }

  async nextSlide(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/game/next`, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to go to next slide');
    }
  }

  async prevSlide(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/game/previous`, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to go to previous slide');
    }
  }

  async showQuestion(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/game/show-question`, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to show question');
    }
  }

  async toggleAnswer(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/game/toggle-answer`, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to toggle answer');
    }
  }

  async startTimer(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/game/start-timer`, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to start timer');
    }
  }

  async stopTimer(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/game/stop-timer`, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to stop timer');
    }
  }

  async resetTimer(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/game/reset-timer`, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to reset timer');
    }
  }

  async updateState(updates: Partial<GameState>): Promise<GameState> {
    const response = await fetch(`${this.baseUrl}/game/state`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      throw new Error('Failed to update state');
    }
    return response.json();
  }

  // Health check
  async getHealth(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error('Failed to check server health');
    }
    return response.json();
  }

  // Network information for QR code generation
  async getNetworkInfo(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/network`);
    if (!response.ok) {
      throw new Error('Failed to fetch network information');
    }
    return response.json();
  }

  // Players API
  async getPlayers(): Promise<Player[]> {
    const response = await fetch(`${this.baseUrl}/players`);
    if (!response.ok) {
      throw new Error('Failed to fetch players');
    }
    return response.json();
  }

  async joinOrLoginGame(name: string, password: string): Promise<Player> {
    const response = await fetch(`${this.baseUrl}/players/join-or-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to join or login');
    }
    return response.json();
  }

  async joinGame(name: string, password: string): Promise<Player> {
    const response = await fetch(`${this.baseUrl}/players/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to join game');
    }
    return response.json();
  }

  async loginPlayer(name: string, password: string): Promise<Player> {
    const response = await fetch(`${this.baseUrl}/players/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to login');
    }
    return response.json();
  }

  async changePlayerPassword(playerId: number, oldPassword: string, newPassword: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/players/${playerId}/change-password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to change password');
    }
  }

  async resetPlayerPassword(playerId: number, newPassword: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/players/${playerId}/reset-password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newPassword }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reset password');
    }
  }

  async updatePlayerScore(playerId: number, score: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/players/${playerId}/score`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ score }),
    });
    if (!response.ok) {
      throw new Error('Failed to update player score');
    }
  }

  async updatePlayerConnection(playerId: number, connected: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/players/${playerId}/connection`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ connected }),
    });
    if (!response.ok) {
      throw new Error('Failed to update player connection');
    }
  }

  async clearAllPlayers(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/players/clear`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to clear all players');
    }
  }

  async resetPlayerScore(playerId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/players/${playerId}/reset-score`, {
      method: 'PUT',
    });
    if (!response.ok) {
      throw new Error('Failed to reset player score');
    }
  }

  async resetAllPlayerScores(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/players/reset-all-scores`, {
      method: 'PUT',
    });
    if (!response.ok) {
      throw new Error('Failed to reset all player scores');
    }
  }

  // Player Answers API
  async submitAnswer(playerId: number, questionId: number, selectedAnswer: string, timeRemaining?: number, timeLimit?: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/answers/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playerId, questionId, selectedAnswer, timeRemaining, timeLimit }),
    });
    if (!response.ok) {
      throw new Error('Failed to submit answer');
    }
  }

  async getPlayerAnswer(playerId: number, questionId: number): Promise<any> {
    const response = await fetch(`${this.baseUrl}/answers/player/${playerId}/question/${questionId}`);
    if (!response.ok) {
      throw new Error('Failed to get player answer');
    }
    return response.json();
  }

  async getQuestionAnswers(questionId: number): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/answers/question/${questionId}`);
    if (!response.ok) {
      throw new Error('Failed to get question answers');
    }
    return response.json();
  }

  async clearQuestionAnswers(questionId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/answers/question/${questionId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to clear question answers');
    }
  }

  // Pending Points API
  async awardPendingPoints(playerId: number, questionId: number, points: number, playerName: string, answer: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/pending-points/award`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playerId, questionId, points, playerName, answer }),
    });
    if (!response.ok) {
      throw new Error('Failed to award pending points');
    }
    return response.json();
  }

  async getPendingPointsForQuestion(questionId: number): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/pending-points/question/${questionId}`);
    if (!response.ok) {
      throw new Error('Failed to get pending points');
    }
    return response.json();
  }

  async commitPendingPoints(questionId: number): Promise<any> {
    const response = await fetch(`${this.baseUrl}/pending-points/commit/${questionId}`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to commit pending points');
    }
    return response.json();
  }

  async clearPendingPointsForQuestion(questionId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/pending-points/question/${questionId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to clear pending points');
    }
  }

  async clearAllPendingPoints(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/pending-points/clear-all`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to clear all pending points');
    }
  }

  // Team API methods
  async getTeams(): Promise<Team[]> {
    const response = await fetch(`${this.baseUrl}/teams`);
    if (!response.ok) {
      throw new Error('Failed to fetch teams');
    }
    return response.json();
  }

  async createTeam(name: string, color?: string): Promise<Team> {
    const response = await fetch(`${this.baseUrl}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, color }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create team');
    }
    return response.json();
  }

  async joinTeam(playerId: number, teamId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/teams/${teamId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playerId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to join team');
    }
  }

  async leaveTeam(playerId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/teams/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playerId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to leave team');
    }
  }

  async deleteTeam(teamId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/teams/${teamId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete team');
    }
  }

  async clearAllTeams(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/teams/clear`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to clear all teams');
    }
  }

  // Buzzer API methods
  async submitBuzzer(playerId: number, questionId: number, teamId?: number): Promise<BuzzerResponse> {
    const response = await fetch(`${this.baseUrl}/buzzer/buzz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playerId, questionId, teamId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit buzzer');
    }
    return response.json();
  }

  async getBuzzerResponses(questionId: number): Promise<BuzzerResponse[]> {
    const response = await fetch(`${this.baseUrl}/buzzer/responses/${questionId}`);
    if (!response.ok) {
      throw new Error('Failed to get buzzer responses');
    }
    return response.json();
  }

  async clearBuzzerResponses(questionId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/buzzer/clear/${questionId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to clear buzzer responses');
    }
  }

  // Feud API methods
  async getFeudAnswers(questionId: number): Promise<FeudAnswer[]> {
    const response = await fetch(`${this.baseUrl}/feud/${questionId}/answers`);
    if (!response.ok) {
      throw new Error('Failed to get feud answers');
    }
    return response.json();
  }

  async revealFeudAnswer(questionId: number, answerId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/feud/${questionId}/reveal/${answerId}`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to reveal feud answer');
    }
  }

  async resetFeudAnswers(questionId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/feud/${questionId}/reset`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to reset feud answers');
    }
  }

  async addFeudAnswer(questionId: number, answerText: string, points: number, displayOrder: number): Promise<FeudAnswer> {
    const response = await fetch(`${this.baseUrl}/feud/${questionId}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ answerText, points, displayOrder }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add feud answer');
    }
    return response.json();
  }

  async deleteFeudAnswer(answerId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/feud/answers/${answerId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete feud answer');
    }
  }

  async awardFeudPoints(questionId: number, playerId: number, teamId: number | null, answerId: number | null, points: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/feud/${questionId}/award`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playerId, teamId, answerId, points }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to award feud points');
    }
  }

  // Feud Game State Management API
  async initializeFeudGame(activeTeamId: number, opposingTeamId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/feud/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ activeTeamId, opposingTeamId }),
    });
    if (!response.ok) {
      throw new Error('Failed to initialize feud game');
    }
  }

  async switchFeudTeams(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/feud/switch-teams`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to switch feud teams');
    }
  }

  async addFeudStrike(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/feud/add-strike`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to add feud strike');
    }
  }

  async removeFeudStrike(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/feud/remove-strike`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to remove feud strike');
    }
  }

  async setFeudPhase(phase: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/feud/set-phase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phase }),
    });
    if (!response.ok) {
      throw new Error('Failed to set feud phase');
    }
  }

  async resetFeudState(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/feud/reset`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to reset feud state');
    }
  }
}

export default new ApiService();
export type { Question, GameSettings, GameState, Player, Team, BuzzerResponse, FeudAnswer };