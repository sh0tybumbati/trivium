// API service for communicating with the backend server

interface Question {
  id?: number;
  category: string;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
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
}

class ApiService {
  private baseUrl: string;

  constructor() {
    // Point to backend server on port 3001
    const host = window.location.hostname;
    this.baseUrl = `${window.location.protocol}//${host}:3001/api`;
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
    const response = await fetch(`${this.baseUrl}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(question),
    });
    if (!response.ok) {
      throw new Error('Failed to add question');
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
}

export default new ApiService();
export type { Question, GameSettings, GameState };