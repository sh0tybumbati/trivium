import { useState, useEffect, useCallback } from 'react';
import apiService, { Question, GameSettings, GameState } from '../services/api';
import websocketService from '../services/websocket';

interface UseNetworkedGameReturn {
  // State
  questions: Question[];
  gameState: GameState;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // Question management
  addQuestion: (question: Omit<Question, 'id'>) => Promise<void>;
  updateQuestion: (id: number, question: Omit<Question, 'id'>) => Promise<void>;
  deleteQuestion: (id: number) => Promise<void>;
  exportQuestions: () => Promise<void>;
  importQuestions: (questions: Question[]) => Promise<void>;
  refreshQuestions: () => Promise<void>;

  // Game control (Host mode only)
  startGame: () => void;
  endGame: () => void;
  nextSlide: () => void;
  prevSlide: () => void;
  showQuestion: () => void;
  toggleAnswer: () => void;
  startTimer: () => void;
  stopTimer: () => void;
  resetTimer: () => void;

  // Settings
  updateSettings: (settings: Partial<GameSettings>) => Promise<void>;

  // Utility
  getFilteredQuestions: () => Question[];
  getAvailableCategories: () => string[];
}

const initialGameState: GameState = {
  gameStarted: false,
  firstQuestionStarted: false,
  currentSlide: 0,
  showAnswer: false,
  timer: 30,
  isTimerRunning: false,
  selectedCategories: [],
  questionLimit: null,
  timeLimit: 30,
  timedRounds: true,
  gameTitle: 'TRIVIA NIGHT',
  gameSubtitle: 'Get Ready to Play!',
  showQuestionCounter: false,
  showWaitScreen: true,
};

export const useNetworkedGame = (appMode: 'landing' | 'bigscreen' | 'host'): UseNetworkedGameReturn => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize connection and load data
  useEffect(() => {
    const initializeData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Load questions and game state
        const [questionsData, stateData] = await Promise.all([
          apiService.getQuestions(),
          apiService.getGameState()
        ]);

        setQuestions(questionsData || []);
        setGameState(stateData || initialGameState);
      } catch (err) {
        console.error('Failed to initialize data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        // Set safe defaults even on error
        setQuestions([]);
        setGameState(initialGameState);
      } finally {
        setIsLoading(false);
      }
    };

    initializeData();

    // Set up WebSocket event listeners
    const unsubscribeConnection = websocketService.onConnection(setIsConnected);
    const unsubscribeStateUpdate = websocketService.onStateUpdate(setGameState);
    const unsubscribeQuestionsUpdate = websocketService.onQuestionsUpdate((action, data) => {
      console.log('Questions updated:', action, data);
      // Refresh questions when they're updated on the server
      refreshQuestions();
    });

    return () => {
      unsubscribeConnection();
      unsubscribeStateUpdate();
      unsubscribeQuestionsUpdate();
    };
  }, []);

  // Question management functions
  const refreshQuestions = useCallback(async () => {
    try {
      const questionsData = await apiService.getQuestions();
      setQuestions(questionsData);
    } catch (err) {
      console.error('Failed to refresh questions:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh questions');
    }
  }, []);

  const addQuestion = useCallback(async (question: Omit<Question, 'id'>) => {
    try {
      await apiService.addQuestion(question);
      // Questions will be refreshed via WebSocket notification
    } catch (err) {
      console.error('Failed to add question:', err);
      setError(err instanceof Error ? err.message : 'Failed to add question');
      throw err;
    }
  }, []);

  const updateQuestion = useCallback(async (id: number, question: Omit<Question, 'id'>) => {
    try {
      await apiService.updateQuestion(id, question);
      // Questions will be refreshed via WebSocket notification
    } catch (err) {
      console.error('Failed to update question:', err);
      setError(err instanceof Error ? err.message : 'Failed to update question');
      throw err;
    }
  }, []);

  const deleteQuestion = useCallback(async (id: number) => {
    try {
      await apiService.deleteQuestion(id);
      // Questions will be refreshed via WebSocket notification
    } catch (err) {
      console.error('Failed to delete question:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete question');
      throw err;
    }
  }, []);

  const exportQuestions = useCallback(async () => {
    try {
      const blob = await apiService.exportQuestions();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'trivia-questions.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export questions:', err);
      setError(err instanceof Error ? err.message : 'Failed to export questions');
      throw err;
    }
  }, []);

  const importQuestions = useCallback(async (questionsToImport: Question[]) => {
    try {
      await apiService.importQuestions(questionsToImport, 'replace');
      // Questions will be refreshed via WebSocket notification
    } catch (err) {
      console.error('Failed to import questions:', err);
      setError(err instanceof Error ? err.message : 'Failed to import questions');
      throw err;
    }
  }, []);

  // Game control functions (Host mode only)
  const startGame = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('START_GAME');
    }
  }, [appMode]);

  const endGame = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('END_GAME');
    }
  }, [appMode]);

  const nextSlide = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('NEXT_SLIDE');
    }
  }, [appMode]);

  const prevSlide = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('PREV_SLIDE');
    }
  }, [appMode]);

  const showQuestion = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('SHOW_QUESTION');
    }
  }, [appMode]);

  const toggleAnswer = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('TOGGLE_ANSWER');
    }
  }, [appMode]);

  const startTimer = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('START_TIMER');
    }
  }, [appMode]);

  const stopTimer = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('STOP_TIMER');
    }
  }, [appMode]);

  const resetTimer = useCallback(() => {
    if (appMode === 'host') {
      websocketService.sendGameAction('RESET_TIMER');
    }
  }, [appMode]);

  // Settings management
  const updateSettings = useCallback(async (settings: Partial<GameSettings>) => {
    try {
      if (appMode === 'host') {
        await apiService.updateGameSettings(settings);
        // Game state will be updated via WebSocket
      }
    } catch (err) {
      console.error('Failed to update settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      throw err;
    }
  }, [appMode]);

  // Utility functions
  const getFilteredQuestions = useCallback(() => {
    if (!questions || !Array.isArray(questions)) {
      return [];
    }
    
    const selectedCategories = gameState?.selectedCategories || [];
    let filtered = selectedCategories.length === 0 
      ? questions 
      : questions.filter(q => selectedCategories.includes(q.category));
    
    if (gameState?.questionLimit && gameState.questionLimit > 0) {
      filtered = filtered.slice(0, gameState.questionLimit);
    }
    
    return filtered;
  }, [questions, gameState?.selectedCategories, gameState?.questionLimit]);

  const getAvailableCategories = useCallback(() => {
    if (!questions || !Array.isArray(questions)) {
      return [];
    }
    return [...new Set(questions.map(q => q.category))];
  }, [questions]);

  // Clear error after some time
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return {
    // State
    questions,
    gameState,
    isConnected,
    isLoading,
    error,

    // Question management
    addQuestion,
    updateQuestion,
    deleteQuestion,
    exportQuestions,
    importQuestions,
    refreshQuestions,

    // Game control
    startGame,
    endGame,
    nextSlide,
    prevSlide,
    showQuestion,
    toggleAnswer,
    startTimer,
    stopTimer,
    resetTimer,

    // Settings
    updateSettings,

    // Utility
    getFilteredQuestions,
    getAvailableCategories,
  };
};

export default useNetworkedGame;