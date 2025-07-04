// API service for communicating with the backend server

interface Question {
  id?: number;
  category: string;
  question: string;
  type: 'multiple_choice' | 'write_in';
  options: string[];
  answer: string;
  explanation: string;
  image_url?: string;
}

interface Player {
  id: number;
  name: string;
  score: number;
  connected: boolean;
  joined_at: string;
  last_seen: string;
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

  async joinGame(name: string): Promise<Player> {
    const response = await fetch(`${this.baseUrl}/players/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to join game');
    }
    return response.json();
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
  async submitAnswer(playerId: number, questionId: number, selectedAnswer: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/answers/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playerId, questionId, selectedAnswer }),
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
}

export default new ApiService();
export type { Question, GameSettings, GameState, Player };